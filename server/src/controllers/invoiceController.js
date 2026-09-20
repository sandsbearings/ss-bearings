import asyncHandler from "express-async-handler";
import Invoice from "../models/Invoice.js";
import Product from "../models/Product.js";
import Party from "../models/Party.js";
import StockMovement from "../models/StockMovement.js";
import { nextSequence } from "../models/Counter.js";
import { calcInvoiceTotals, DEFAULT_GST_RATE } from "../utils/gstCalc.js";
import { getFinancialYearLabel } from "../utils/financialYear.js";
import { getPagination, buildPage } from "../utils/paginate.js";
import { streamInvoicePdf } from "../utils/generateInvoicePdf.js";

// Validates each line's product/stock and resolves its billed price. `existingReserved` maps
// productId -> quantity this invoice (when editing) already holds, so stock availability is
// checked as "what's free right now, plus what this invoice itself already accounts for" — lets
// an edit validate cleanly with zero DB writes before anything is actually touched.
async function resolveInvoiceItems(res, items, partyId, existingReserved = new Map()) {
  if (!items?.length) {
    res.status(400);
    throw new Error("Invoice must have at least one item");
  }

  const productIds = items.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: productIds } });
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  return items.map(({ productId, quantity, unitPrice }) => {
    const product = productMap.get(productId);
    if (!product) {
      res.status(404);
      throw new Error(`Product ${productId} not found`);
    }
    const available = product.currentStock + (existingReserved.get(productId) || 0);
    if (available < quantity) {
      res.status(400);
      throw new Error(`Insufficient stock for ${product.bearingNumber} (have ${available}, need ${quantity})`);
    }

    // The cashier can override the saved retail price per line at checkout time; falls back
    // to the product's stored price when not given.
    let price = product.retailPrice;
    if (unitPrice !== undefined && unitPrice !== null && unitPrice !== "") {
      const n = Number(unitPrice);
      if (!Number.isFinite(n) || n < 0) {
        res.status(400);
        throw new Error(`Invalid rate for ${product.bearingNumber}`);
      }
      price = n;
    }

    return {
      product: product._id,
      bearingNumber: product.bearingNumber,
      brand: product.brand,
      hsnCode: product.hsnCode,
      unit: product.unit,
      quantity,
      unitPrice: price,
      // Walk-in (no party on the invoice) sales are billed tax-free.
      gstRate: partyId ? DEFAULT_GST_RATE : 0,
    };
  });
}

function resolveDiscount(res, discountType, discountValue) {
  if (discountValue === undefined || discountValue === null || discountValue === "" || Number(discountValue) <= 0) {
    return undefined;
  }
  const value = Number(discountValue);
  if (!Number.isFinite(value) || value < 0) {
    res.status(400);
    throw new Error("Invalid discount value");
  }
  if (discountType !== "flat" && discountType !== "percent") {
    res.status(400);
    throw new Error("Invalid discount type");
  }
  if (discountType === "percent" && value > 100) {
    res.status(400);
    throw new Error("Discount percent cannot exceed 100");
  }
  return { type: discountType, value };
}

// Decrements stock and logs a "sale" movement for each line — the effect of a new or edited invoice.
async function applySaleEffects(lineInputs, invoiceNo, userId) {
  for (const item of lineInputs) {
    await Product.findByIdAndUpdate(item.product, { $inc: { currentStock: -item.quantity } });
    await StockMovement.create({
      product: item.product,
      type: "sale",
      quantity: item.quantity,
      reference: invoiceNo,
      createdBy: userId,
    });
  }
}

// Restores stock and logs a "return" movement for each line — undoes a sale, for an edit or a
// void. Kept as its own movement (not a deletion of the original "sale" entries) so stock history
// stays a full audit trail rather than being rewritten.
async function reverseSaleEffects(items, invoiceNo, userId, note) {
  for (const item of items) {
    await Product.findByIdAndUpdate(item.product, { $inc: { currentStock: item.quantity } });
    await StockMovement.create({
      product: item.product,
      type: "return",
      quantity: item.quantity,
      reference: invoiceNo,
      note,
      createdBy: userId,
    });
  }
}

async function applyPartyCredit(partyId, paymentStatus, grandTotal, paid) {
  if (partyId && paymentStatus !== "paid") {
    const unpaid = grandTotal - paid;
    await Party.findByIdAndUpdate(partyId, { $inc: { creditBalance: unpaid } });
  }
}

async function reversePartyCredit(partyId, invoice) {
  if (partyId && invoice.paymentStatus !== "paid") {
    const unpaid = invoice.grandTotal - invoice.amountPaid;
    await Party.findByIdAndUpdate(partyId, { $inc: { creditBalance: -unpaid } });
  }
}

// POST /api/invoices
// body: { partyId?, isInterState, paymentMode, amountPaid, discountType?, discountValue?,
//         items: [{ productId, quantity, unitPrice? }] }
export const createInvoice = asyncHandler(async (req, res) => {
  const {
    partyId,
    isInterState = false,
    paymentMode = "cash",
    amountPaid,
    items,
    discountType,
    discountValue,
  } = req.body;

  const lineInputs = await resolveInvoiceItems(res, items, partyId);
  const discount = resolveDiscount(res, discountType, discountValue);
  const totals = calcInvoiceTotals(lineInputs, isInterState, discount);

  // Default to fully paid (grand total, tax included) when the caller doesn't specify an amount —
  // e.g. cash/UPI/card sales collected in full. Only "credit" sales default to 0 paid.
  const paid = amountPaid ?? (paymentMode === "credit" ? 0 : totals.grandTotal);
  const paymentStatus =
    paymentMode === "credit" ? "credit" : paid >= totals.grandTotal ? "paid" : "partial";

  const fyLabel = getFinancialYearLabel();
  const seq = await nextSequence(`invoice-${fyLabel}`);
  const invoiceNo = `SS/${fyLabel}/${String(seq).padStart(4, "0")}`;

  const invoice = await Invoice.create({
    invoiceNo,
    party: partyId || undefined,
    items: totals.items,
    isInterState,
    subtotal: totals.subtotal,
    discountType: discount?.type,
    discountValue: discount?.value ?? 0,
    discountAmount: totals.discountAmount,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    totalTax: totals.totalTax,
    grandTotal: totals.grandTotal,
    paymentMode,
    paymentStatus,
    amountPaid: paid,
    createdBy: req.user._id,
  });

  await applySaleEffects(lineInputs, invoiceNo, req.user._id);
  await applyPartyCredit(partyId, paymentStatus, totals.grandTotal, paid);

  res.status(201).json(invoice);
});

// PUT /api/invoices/:id  (admin only — full edit: items, party, payment info, discount)
// Same body shape as create. Validates the new items first (the stock check accounts for what
// this invoice already reserves), then reverses the invoice's current stock/credit effects and
// applies fresh ones for the edited version.
export const updateInvoice = asyncHandler(async (req, res) => {
  const existing = await Invoice.findById(req.params.id);
  if (!existing) {
    res.status(404);
    throw new Error("Invoice not found");
  }
  if (existing.status === "voided") {
    res.status(400);
    throw new Error("Cannot edit a voided invoice");
  }

  const {
    partyId,
    isInterState = false,
    paymentMode = "cash",
    amountPaid,
    items,
    discountType,
    discountValue,
  } = req.body;

  const existingReserved = new Map();
  for (const item of existing.items) {
    const key = item.product.toString();
    existingReserved.set(key, (existingReserved.get(key) || 0) + item.quantity);
  }

  const lineInputs = await resolveInvoiceItems(res, items, partyId, existingReserved);
  const discount = resolveDiscount(res, discountType, discountValue);
  const totals = calcInvoiceTotals(lineInputs, isInterState, discount);

  const paid = amountPaid ?? (paymentMode === "credit" ? 0 : totals.grandTotal);
  const paymentStatus =
    paymentMode === "credit" ? "credit" : paid >= totals.grandTotal ? "paid" : "partial";

  // Everything above is pure validation/computation — nothing written yet. From here on we undo
  // the invoice's current effects and apply the edited ones.
  await reverseSaleEffects(existing.items, existing.invoiceNo, req.user._id, "Invoice edit reversal");
  await reversePartyCredit(existing.party, existing);

  existing.party = partyId || undefined;
  existing.items = totals.items;
  existing.isInterState = isInterState;
  existing.subtotal = totals.subtotal;
  existing.discountType = discount?.type;
  existing.discountValue = discount?.value ?? 0;
  existing.discountAmount = totals.discountAmount;
  existing.cgst = totals.cgst;
  existing.sgst = totals.sgst;
  existing.igst = totals.igst;
  existing.totalTax = totals.totalTax;
  existing.grandTotal = totals.grandTotal;
  existing.paymentMode = paymentMode;
  existing.paymentStatus = paymentStatus;
  existing.amountPaid = paid;
  await existing.save();

  await applySaleEffects(lineInputs, existing.invoiceNo, req.user._id);
  await applyPartyCredit(partyId, paymentStatus, totals.grandTotal, paid);

  res.json(existing);
});

// POST /api/invoices/:id/void  (admin only — cancels an invoice without deleting it: keeps its
// number and record for the audit trail, but reverses stock/credit and excludes it from reports)
export const voidInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) {
    res.status(404);
    throw new Error("Invoice not found");
  }
  if (invoice.status === "voided") {
    res.status(400);
    throw new Error("Invoice is already voided");
  }

  await reverseSaleEffects(invoice.items, invoice.invoiceNo, req.user._id, "Invoice voided");
  await reversePartyCredit(invoice.party, invoice);

  invoice.status = "voided";
  invoice.voidedAt = new Date();
  invoice.voidedBy = req.user._id;
  await invoice.save();

  res.json(invoice);
});

// GET /api/invoices?search=&from=&to=&page=&limit=
export const listInvoices = asyncHandler(async (req, res) => {
  const { search, from, to } = req.query;
  const query = {};

  if (search) {
    const matchingParties = await Party.find({ name: new RegExp(search, "i") }).select("_id");
    query.$or = [
      { invoiceNo: new RegExp(search, "i") },
      { party: { $in: matchingParties.map((p) => p._id) } },
    ];
  }

  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(`${from}T00:00:00.000`);
    if (to) query.createdAt.$lte = new Date(`${to}T23:59:59.999`);
  }

  const { page, limit, skip } = getPagination(req.query);
  const [invoices, total] = await Promise.all([
    Invoice.find(query).populate("party", "name phone").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Invoice.countDocuments(query),
  ]);
  res.json(buildPage(invoices, total, page, limit));
});

// GET /api/invoices/:id
export const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id).populate("party");
  if (!invoice) {
    res.status(404);
    throw new Error("Invoice not found");
  }
  res.json(invoice);
});

// GET /api/invoices/:id/pdf
export const getInvoicePdf = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id).populate("party");
  if (!invoice) {
    res.status(404);
    throw new Error("Invoice not found");
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=${invoice.invoiceNo}.pdf`);
  streamInvoicePdf(invoice, invoice.party, res);
});
