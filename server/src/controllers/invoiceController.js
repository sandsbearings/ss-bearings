import asyncHandler from "express-async-handler";
import Invoice from "../models/Invoice.js";
import Product from "../models/Product.js";
import Party from "../models/Party.js";
import Payment from "../models/Payment.js";
import StockMovement from "../models/StockMovement.js";
import { nextSequence } from "../models/Counter.js";
import { calcInvoiceTotals, DEFAULT_GST_RATE } from "../utils/gstCalc.js";
import { getFinancialYearLabel } from "../utils/financialYear.js";
import { roundAmount } from "../utils/money.js";
import { getPagination, buildPage } from "../utils/paginate.js";
import { streamInvoicePdf } from "../utils/generateInvoicePdf.js";
import { searchRegex } from "../utils/searchRegex.js";
import { istDateRange, istParts } from "../utils/indiaTime.js";
import { billedToFrom, billedToOf, isGstLocked } from "../utils/invoiceRules.js";
import { withTransaction } from "../utils/transaction.js";
import {
  changePartyBalance,
  paymentStatusFor,
  releaseInvoicePayments,
  settleParty,
} from "../utils/creditLedger.js";

// The bill's customer, for the billedTo snapshot.
async function findBillingParty(res, partyId) {
  const party = partyId ? await Party.findById(partyId) : null;
  if (!party) {
    res.status(400);
    throw new Error("Select a customer for the invoice");
  }
  return party;
}

// Refuses to change a tax bill once its month is over (see invoiceRules).
function assertNotGstLocked(res, invoice, action) {
  if (!isGstLocked(invoice)) return;
  const { year, month } = istParts(invoice.createdAt);
  const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-IN", { month: "long", timeZone: "UTC" });
  res.status(400);
  throw new Error(
    `${invoice.invoiceNo} is a tax bill from ${monthName} ${year}. Tax bills can only be ${action} in the month ` +
      `they were made. To correct it, a credit note is needed — please check with your CA.`
  );
}

// Validates each line's product/stock and resolves its billed price. `existingReserved` maps
// productId -> quantity this invoice (when editing) already holds, so stock availability is
// checked as "what's free right now, plus what this invoice itself already accounts for" — lets
// an edit validate cleanly with zero DB writes before anything is actually touched.
async function resolveInvoiceItems(res, items, partyId, applyTax, existingReserved = new Map()) {
  if (!partyId) {
    res.status(400);
    throw new Error("Select a customer for the invoice");
  }
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
      // The cashier can untick "Add GST" at checkout to bill without tax.
      gstRate: applyTax ? DEFAULT_GST_RATE : 0,
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

// Two separate number series, each with its own counter so neither ever skips a number:
//   with GST    -> SS/2026-27/0001  (restarts every financial year; required for tax invoices)
//   without GST -> SS/0001          (one running series, never resets)
async function nextInvoiceNo(isTaxed) {
  if (isTaxed) {
    const fyLabel = getFinancialYearLabel();
    const seq = await nextSequence(`invoice-${fyLabel}`);
    return `SS/${fyLabel}/${String(seq).padStart(4, "0")}`;
  }
  const seq = await nextSequence("invoice-notax");
  return `SS/${String(seq).padStart(4, "0")}`;
}

// Amount paid at the counter: the caller's amountPaid, or by default the full bill (0 for credit
// sales). Must be between 0 and the bill total.
function resolvePaid(res, amountPaid, paymentMode, grandTotal) {
  if (amountPaid === undefined || amountPaid === null || amountPaid === "") {
    return paymentMode === "credit" ? 0 : grandTotal;
  }
  const paid = roundAmount(Number(amountPaid));
  if (!Number.isFinite(paid) || paid < 0) {
    res.status(400);
    throw new Error("Invalid amount paid");
  }
  if (paid > grandTotal) {
    res.status(400);
    throw new Error("Amount paid can't be more than the bill total");
  }
  return paid;
}

// Adds the part of the bill not paid at the counter to what the customer owes.
async function applyPartyCredit(partyId, grandTotal, paid) {
  const unpaid = roundAmount(grandTotal - paid);
  if (partyId && unpaid > 0) {
    await changePartyBalance(partyId, { creditBalance: unpaid });
  }
}

// Removes the invoice's remaining due from what the customer owes. Call releaseInvoicePayments
// first, so any receipt money on the bill goes back to the customer's advance rather than vanishing.
async function reversePartyCredit(partyId, invoice) {
  const unpaid = roundAmount(invoice.grandTotal - invoice.amountPaid);
  if (partyId && unpaid > 0) {
    await changePartyBalance(partyId, { creditBalance: -unpaid });
  }
}

// POST /api/invoices
// body: { partyId?, isInterState, paymentMode, amountPaid, discountType?, discountValue?,
//         items: [{ productId, quantity, unitPrice? }] }
export const createInvoice = asyncHandler(async (req, res) => {
  // One transaction: the stock check, bill number, stock and balance changes all happen together,
  // and a clash with another sale (e.g. both selling the last bearing) re-runs this with fresh stock.
  const invoiceId = await withTransaction(async () => {
    const {
      partyId,
      isInterState = false,
      applyTax = true,
      paymentMode = "cash",
      amountPaid,
      items,
      discountType,
      discountValue,
    } = req.body;

    const lineInputs = await resolveInvoiceItems(res, items, partyId, applyTax !== false);
    const party = await findBillingParty(res, partyId);
    const discount = resolveDiscount(res, discountType, discountValue);
    const totals = calcInvoiceTotals(lineInputs, isInterState, discount);

    // Default to fully paid (grand total, tax included) when the caller doesn't specify an amount —
    // e.g. cash/UPI/card sales collected in full. Only "credit" sales default to 0 paid.
    const paid = resolvePaid(res, amountPaid, paymentMode, totals.grandTotal);
    const paymentStatus = paymentStatusFor(paid, totals.grandTotal);

    const invoiceNo = await nextInvoiceNo(applyTax !== false);

    const invoice = await Invoice.create({
      invoiceNo,
      party: partyId || undefined,
      billedTo: billedToFrom(party),
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
    await applyPartyCredit(partyId, totals.grandTotal, paid);
    // Uses up any advance the customer has on this new bill.
    await settleParty(partyId);

    return invoice._id;
  });

  res.status(201).json(await Invoice.findById(invoiceId));
});

// PUT /api/invoices/:id  (admin only — full edit: items, party, payment info, discount)
// Same body shape as create. Validates the new items first (the stock check accounts for what
// this invoice already reserves), then reverses the invoice's current stock/credit effects and
// applies fresh ones for the edited version.
export const updateInvoice = asyncHandler(async (req, res) => {
  await withTransaction(async () => {
    const existing = await Invoice.findById(req.params.id);
    if (!existing) {
      res.status(404);
      throw new Error("Invoice not found");
    }
    if (existing.status === "voided") {
      res.status(400);
      throw new Error("Cannot edit a voided invoice");
    }
    assertNotGstLocked(res, existing, "edited");

    const {
      partyId,
      isInterState = false,
      applyTax = true,
      paymentMode = "cash",
      amountPaid,
      items,
      discountType,
      discountValue,
    } = req.body;

    // With/without GST decides which number series the bill is in, so it can't change on edit —
    // that would leave a gap in the tax series or a bill numbered in the wrong series.
    const wasTaxed = existing.items.some((item) => item.gstRate > 0);
    if ((applyTax !== false) !== wasTaxed) {
      res.status(400);
      throw new Error(
        `GST can't be ${wasTaxed ? "removed from" : "added to"} an existing bill. Void it and create a new one instead.`
      );
    }

    const existingReserved = new Map();
    for (const item of existing.items) {
      const key = item.product.toString();
      existingReserved.set(key, (existingReserved.get(key) || 0) + item.quantity);
    }

    const lineInputs = await resolveInvoiceItems(res, items, partyId, applyTax !== false, existingReserved);
    const party = await findBillingParty(res, partyId);
    const discount = resolveDiscount(res, discountType, discountValue);
    const totals = calcInvoiceTotals(lineInputs, isInterState, discount);

    const paid = resolvePaid(res, amountPaid, paymentMode, totals.grandTotal);
    const paymentStatus = paymentStatusFor(paid, totals.grandTotal);

    // Everything above is pure validation/computation — nothing written yet. From here on we undo
    // the invoice's current effects and apply the edited ones. Receipt money on this bill goes back
    // to the customer's advance first, and is re-applied (to this bill, oldest first) further down.
    const previousParty = existing.party;
    await releaseInvoicePayments(existing);
    await reverseSaleEffects(existing.items, existing.invoiceNo, req.user._id, "Invoice edit reversal");
    await reversePartyCredit(previousParty, existing);

    existing.party = partyId || undefined;
    existing.billedTo = billedToFrom(party);
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
    await applyPartyCredit(partyId, totals.grandTotal, paid);
    await settleParty(previousParty);
    if (partyId && String(partyId) !== String(previousParty)) await settleParty(partyId);
  });

  res.json(await Invoice.findById(req.params.id));
});

// POST /api/invoices/:id/void  (admin only — cancels an invoice without deleting it: keeps its
// number and record for the audit trail, but reverses stock/credit and excludes it from reports)
export const voidInvoice = asyncHandler(async (req, res) => {
  // A second void of the same bill (e.g. from another tab) clashes, re-runs, and gets "already voided".
  await withTransaction(async () => {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      res.status(404);
      throw new Error("Invoice not found");
    }
    if (invoice.status === "voided") {
      res.status(400);
      throw new Error("Invoice is already voided");
    }
    assertNotGstLocked(res, invoice, "voided");

    // Receipt money on this bill goes back to the customer's advance, then onto their other open bills.
    await releaseInvoicePayments(invoice);
    await reverseSaleEffects(invoice.items, invoice.invoiceNo, req.user._id, "Invoice voided");
    await reversePartyCredit(invoice.party, invoice);

    invoice.status = "voided";
    invoice.voidedAt = new Date();
    invoice.voidedBy = req.user._id;
    await invoice.save();
    await settleParty(invoice.party);
  });

  res.json(await Invoice.findById(req.params.id));
});

// GET /api/invoices?search=&from=&to=&payment=unpaid|paid&billType=tax|notax&page=&limit=
export const listInvoices = asyncHandler(async (req, res) => {
  const { search, from, to, payment, billType } = req.query;
  const query = {};

  // A bill is a tax invoice when its lines carry GST (every line shares the same rate).
  if (billType === "tax") {
    query["items.gstRate"] = { $gt: 0 };
  } else if (billType === "notax") {
    query["items.gstRate"] = { $not: { $gt: 0 } };
  }

  if (payment === "unpaid") {
    query.paymentStatus = { $in: ["partial", "credit"] };
    query.status = { $ne: "voided" };
  } else if (payment === "paid") {
    query.paymentStatus = "paid";
  }

  if (search) {
    const matchingParties = await Party.find({ name: searchRegex(search) }).select("_id");
    query.$or = [
      { invoiceNo: searchRegex(search) },
      { party: { $in: matchingParties.map((p) => p._id) } },
    ];
  }

  const range = istDateRange(from, to);
  if (range) query.createdAt = range;

  const { page, limit, skip } = getPagination(req.query);
  const [invoices, total] = await Promise.all([
    Invoice.find(query).populate("party", "name phone").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Invoice.countDocuments(query),
  ]);
  const items = invoices.map((inv) => ({ ...inv.toJSON(), gstLocked: isGstLocked(inv) }));
  res.json(buildPage(items, total, page, limit));
});

// GET /api/invoices/:id
export const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id).populate("party");
  if (!invoice) {
    res.status(404);
    throw new Error("Invoice not found");
  }

  // How much of amountPaid came from receipts (payments received later) rather than at the
  // counter — the edit page warns about it when the bill is moved to another customer.
  const [fromReceipts] = await Payment.aggregate([
    { $match: { status: "active", "allocations.invoice": invoice._id } },
    { $unwind: "$allocations" },
    { $match: { "allocations.invoice": invoice._id } },
    { $group: { _id: null, total: { $sum: "$allocations.amount" } } },
  ]);

  res.json({
    ...invoice.toJSON(),
    receiptsPaid: roundAmount(fromReceipts?.total || 0),
    gstLocked: isGstLocked(invoice),
  });
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
  streamInvoicePdf(invoice, billedToOf(invoice), res);
});
