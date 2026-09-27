import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import Invoice from "../models/Invoice.js";
import Party from "../models/Party.js";
import Payment from "../models/Payment.js";
import { getPagination, buildPage } from "../utils/paginate.js";
import { roundAmount } from "../utils/money.js";
import { invoiceDue } from "../utils/creditLedger.js";
import { istDateRange as dateRange, istDayNumber } from "../utils/indiaTime.js";
import { billedToOf } from "../utils/invoiceRules.js";

const sum = (rows, key) => roundAmount(rows.reduce((total, row) => total + (row[key] || 0), 0));

// GET /api/reports/low-stock
export const lowStockReport = asyncHandler(async (req, res) => {
  const products = await Product.find({ $expr: { $lte: ["$currentStock", "$reorderLevel"] } }).sort({
    currentStock: 1,
  });
  res.json(products);
});

// GET /api/reports/stock-valuation?page=&limit=
export const stockValuationReport = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const [products, total] = await Promise.all([
    Product.find().sort({ bearingNumber: 1 }).skip(skip).limit(limit),
    Product.countDocuments(),
  ]);
  const items = products.map((p) => ({
    bearingNumber: p.bearingNumber,
    brand: p.brand,
    currentStock: p.currentStock,
    costPrice: p.costPrice,
    stockValue: roundAmount(p.currentStock * p.costPrice),
  }));

  // Total value has to reflect every product, not just this page, so it's summed via aggregation
  // rather than by loading the whole catalog into memory.
  const [totals] = await Product.aggregate([
    { $group: { _id: null, totalValue: { $sum: { $multiply: ["$currentStock", "$costPrice"] } } } },
  ]);

  res.json({
    ...buildPage(items, total, page, limit),
    totalValue: roundAmount(totals?.totalValue || 0),
  });
});

// GET /api/reports/sales?from=&to=&billType=tax|notax&page=&limit=
// (?all=1 returns every row, for the CSV download). The taxed / non-taxed totals always cover the
// whole date range; billType only narrows the bill list.
export const salesReport = asyncHandler(async (req, res) => {
  const { from, to, billType } = req.query;
  // $ne (not "status: active") so invoices from before the voided-status field existed —
  // which have no status stored at all — still count as active rather than being dropped.
  const match = { status: { $ne: "voided" } };
  const range = dateRange(from, to);
  if (range) match.createdAt = range;

  // Same test as the Invoices list: a tax invoice is one whose lines carry GST.
  const listMatch = { ...match };
  if (billType === "tax") listMatch["items.gstRate"] = { $gt: 0 };
  else if (billType === "notax") listMatch["items.gstRate"] = { $not: { $gt: 0 } };

  const all = req.query.all === "1";
  const { page, limit, skip } = all ? { page: 1, limit: 0, skip: 0 } : getPagination(req.query);
  const [invoices, total, totals] = await Promise.all([
    Invoice.find(listMatch)
      .populate("party", "name")
      .select("invoiceNo createdAt party billedTo items.gstRate grandTotal totalTax paymentMode paymentStatus")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Invoice.countDocuments(listMatch),
    Invoice.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $gt: [{ $max: "$items.gstRate" }, 0] }, // true = tax invoice
          count: { $sum: 1 },
          sales: { $sum: "$grandTotal" },
          tax: { $sum: "$totalTax" },
        },
      },
    ]),
  ]);
  const group = (taxed) => {
    const g = totals.find((t) => t._id === taxed) || {};
    return { count: g.count || 0, sales: roundAmount(g.sales || 0), tax: roundAmount(g.tax || 0) };
  };
  const taxed = group(true);
  const untaxed = group(false);

  const items = invoices.map((inv) => ({
    _id: inv._id,
    invoiceNo: inv.invoiceNo,
    createdAt: inv.createdAt,
    customer: billedToOf(inv)?.name || "",
    taxBill: inv.items.some((item) => item.gstRate > 0),
    grandTotal: inv.grandTotal,
    totalTax: inv.totalTax,
    paymentMode: inv.paymentMode,
    paymentStatus: inv.paymentStatus,
  }));

  res.json({
    ...buildPage(items, total, page, all ? Math.max(total, 1) : limit),
    invoiceCount: taxed.count + untaxed.count,
    totalSales: roundAmount(taxed.sales + untaxed.sales),
    totalTax: taxed.tax,
    taxed,
    untaxed,
  });
});

// GET /api/reports/parties?from=&to=
// Customer-wise sales for the date range: bills, sales (taxed / non-taxed), GST and money received
// from each customer, plus what they owe right now and their last bill (ever). Customers who only
// paid in the range (no bills) are included too, so every rupee received shows up somewhere.
export const partySalesReport = asyncHandler(async (req, res) => {
  const range = dateRange(req.query.from, req.query.to);
  const invoiceMatch = { status: { $ne: "voided" }, party: { $ne: null } };
  const paymentMatch = { status: "active" };
  if (range) {
    invoiceMatch.createdAt = range;
    paymentMatch.receivedAt = range;
  }

  const [sales, receipts] = await Promise.all([
    Invoice.aggregate([
      { $match: invoiceMatch },
      { $addFields: { taxed: { $gt: [{ $max: "$items.gstRate" }, 0] } } },
      {
        $group: {
          _id: "$party",
          bills: { $sum: 1 },
          sales: { $sum: "$grandTotal" },
          taxedSales: { $sum: { $cond: ["$taxed", "$grandTotal", 0] } },
          gst: { $sum: "$totalTax" },
          amountPaid: { $sum: "$amountPaid" },
          invoiceIds: { $push: "$_id" },
        },
      },
    ]),
    Payment.aggregate([{ $match: paymentMatch }, { $group: { _id: "$party", total: { $sum: "$amount" } } }]),
  ]);

  // A bill's amountPaid also counts receipt money put on it later; only the rest was paid at the
  // counter (the receipts themselves are counted on their own date above) — as in collectionsReport.
  const invoiceIds = sales.flatMap((s) => s.invoiceIds);
  const receiptMoneyOnBills = await Payment.aggregate([
    { $match: { status: "active", "allocations.invoice": { $in: invoiceIds } } },
    { $unwind: "$allocations" },
    { $match: { "allocations.invoice": { $in: invoiceIds } } },
    { $group: { _id: "$party", total: { $sum: "$allocations.amount" } } },
  ]);

  const byId = (list) => new Map(list.map((x) => [x._id.toString(), x]));
  const salesBy = byId(sales);
  const receiptsBy = byId(receipts);
  const onBillsBy = byId(receiptMoneyOnBills);
  const partyIds = [...new Set([...salesBy.keys(), ...receiptsBy.keys()])];

  const [parties, lastBills] = await Promise.all([
    Party.find({ _id: { $in: partyIds } }).select("name phone creditBalance"),
    Invoice.aggregate([
      { $match: { status: { $ne: "voided" }, party: { $in: partyIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
      { $group: { _id: "$party", lastBill: { $max: "$createdAt" } } },
    ]),
  ]);
  const partyBy = byId(parties);
  const lastBillBy = byId(lastBills);

  const rows = partyIds.map((id) => {
    const s = salesBy.get(id) || {};
    const party = partyBy.get(id);
    const atCounter = Math.max(0, (s.amountPaid || 0) - (onBillsBy.get(id)?.total || 0));
    return {
      partyId: id,
      name: party?.name || "(deleted customer)",
      phone: party?.phone || "",
      bills: s.bills || 0,
      sales: roundAmount(s.sales || 0),
      taxedSales: roundAmount(s.taxedSales || 0),
      untaxedSales: roundAmount((s.sales || 0) - (s.taxedSales || 0)),
      gst: roundAmount(s.gst || 0),
      received: roundAmount(atCounter + (receiptsBy.get(id)?.total || 0)),
      balance: roundAmount(party?.creditBalance || 0), // + owes us, - advance
      lastBill: lastBillBy.get(id)?.lastBill || null,
    };
  });
  rows.sort((a, b) => b.sales - a.sales || b.received - a.received);

  const totalSales = sum(rows, "sales");
  const top5 = sum(rows.slice(0, 5), "sales");

  res.json({
    rows,
    customers: rows.filter((r) => r.bills > 0).length,
    totalSales,
    totalReceived: sum(rows, "received"),
    top5Share: totalSales > 0 ? Math.round((top5 / totalSales) * 100) : 0,
  });
});

// GET /api/reports/inactive?days=60
// Customers with no bill in the last `days` days (India calendar days), plus customers who never
// bought — a follow-up call list. Biggest buyers over the last 12 months come first, since they're
// the ones most worth calling. Ignores any date range: it's always "as of today".
export const inactiveCustomersReport = asyncHandler(async (req, res) => {
  const days = Math.max(1, parseInt(req.query.days, 10) || 60);
  const today = istDayNumber(new Date());
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const [customers, billing] = await Promise.all([
    Party.find({ type: "customer" }).select("name phone creditBalance createdAt"),
    Invoice.aggregate([
      { $match: { status: { $ne: "voided" }, party: { $ne: null } } },
      {
        $group: {
          _id: "$party",
          lastBill: { $max: "$createdAt" },
          last12Months: { $sum: { $cond: [{ $gte: ["$createdAt", yearAgo] }, "$grandTotal", 0] } },
          allTime: { $sum: "$grandTotal" },
        },
      },
    ]),
  ]);
  const billingBy = new Map(billing.map((b) => [b._id.toString(), b]));

  const rows = [];
  for (const party of customers) {
    const b = billingBy.get(party._id.toString());
    const daysSince = b ? today - istDayNumber(b.lastBill) : null;
    if (daysSince !== null && daysSince < days) continue; // bought recently
    rows.push({
      partyId: party._id,
      name: party.name,
      phone: party.phone || "",
      lastBill: b?.lastBill || null,
      daysSince, // null = never bought
      last12Months: roundAmount(b?.last12Months || 0),
      allTime: roundAmount(b?.allTime || 0),
      balance: roundAmount(party.creditBalance || 0),
      addedOn: party.createdAt,
    });
  }
  // Biggest past buyers first; then the longest-quiet; never-bought customers last.
  rows.sort(
    (a, b) =>
      b.last12Months - a.last12Months ||
      b.allTime - a.allTime ||
      (a.daysSince === null) - (b.daysSince === null) ||
      (b.daysSince ?? 0) - (a.daysSince ?? 0)
  );

  res.json({
    days,
    rows,
    inactive: rows.filter((r) => r.daysSince !== null).length,
    neverBought: rows.filter((r) => r.daysSince === null).length,
    last12MonthsBusiness: sum(rows, "last12Months"),
    dueFromThem: sum(rows.filter((r) => r.balance > 0), "balance"),
  });
});

const AGE_BUCKETS = [
  { key: "0-30", max: 30 },
  { key: "31-60", max: 60 },
  { key: "61-90", max: 90 },
  { key: "90+", max: Infinity },
];

function ageBucket(days) {
  return AGE_BUCKETS.find((b) => days <= b.max).key;
}

// GET /api/reports/outstanding
// Every customer who owes money: total due, oldest unpaid bill, and dues split by how old each
// bill is. Opening balances (dues from before this system) have no bill date, so they count as 90+.
export const outstandingReport = asyncHandler(async (req, res) => {
  const today = istDayNumber(new Date());
  const [invoices, openingParties, advance] = await Promise.all([
    Invoice.find({
      party: { $ne: null },
      status: { $ne: "voided" },
      $expr: { $lt: ["$amountPaid", "$grandTotal"] },
    })
      .select("party invoiceNo createdAt grandTotal amountPaid")
      .sort({ createdAt: 1 }),
    Party.find({ type: "customer", $expr: { $gt: ["$openingBalance", "$openingPaid"] } }).select(
      "openingBalance openingPaid"
    ),
    Payment.aggregate([
      { $match: { status: "active", unallocated: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: "$unallocated" } } },
    ]),
  ]);

  const rowsByParty = new Map();
  function rowFor(partyId) {
    const key = partyId.toString();
    if (!rowsByParty.has(key)) {
      rowsByParty.set(key, {
        partyId: key,
        totalDue: 0,
        bills: 0,
        openingDue: 0,
        oldestDate: null,
        oldestDays: null,
        buckets: Object.fromEntries(AGE_BUCKETS.map((b) => [b.key, 0])),
      });
    }
    return rowsByParty.get(key);
  }

  for (const party of openingParties) {
    const due = roundAmount(party.openingBalance - party.openingPaid);
    const row = rowFor(party._id);
    row.openingDue = due;
    row.totalDue = roundAmount(row.totalDue + due);
    row.buckets["90+"] = roundAmount(row.buckets["90+"] + due);
  }

  for (const inv of invoices) {
    const due = invoiceDue(inv);
    if (due <= 0) continue;
    const row = rowFor(inv.party);
    const days = today - istDayNumber(inv.createdAt);
    const bucket = ageBucket(days);
    row.bills += 1;
    row.totalDue = roundAmount(row.totalDue + due);
    row.buckets[bucket] = roundAmount(row.buckets[bucket] + due);
    if (row.oldestDate === null) {
      // invoices are sorted oldest first, so the first one seen per party is its oldest
      row.oldestDate = inv.createdAt;
      row.oldestDays = days;
    }
  }

  const rows = [...rowsByParty.values()];
  const parties = await Party.find({ _id: { $in: rows.map((r) => r.partyId) } }).select("name phone");
  const partyById = new Map(parties.map((p) => [p._id.toString(), p]));
  for (const row of rows) {
    const party = partyById.get(row.partyId);
    row.name = party?.name || "(deleted customer)";
    row.phone = party?.phone || "";
  }
  rows.sort((a, b) => b.totalDue - a.totalDue);

  res.json({
    rows,
    totalOutstanding: sum(rows, "totalDue"),
    customers: rows.length,
    buckets: Object.fromEntries(
      AGE_BUCKETS.map((b) => [b.key, roundAmount(rows.reduce((t, r) => t + r.buckets[b.key], 0))])
    ),
    advanceHeld: roundAmount(advance[0]?.total || 0),
  });
});

// GET /api/reports/collections?from=&to=
// All money received in the range: paid at the counter when a bill was made, plus receipts
// (payments received later against credit). Totals split by payment mode.
export const collectionsReport = asyncHandler(async (req, res) => {
  const range = dateRange(req.query.from, req.query.to);

  const invoiceMatch = { status: { $ne: "voided" }, amountPaid: { $gt: 0 } };
  const paymentMatch = { status: "active" };
  if (range) {
    invoiceMatch.createdAt = range;
    paymentMatch.receivedAt = range;
  }

  const [invoices, receipts] = await Promise.all([
    Invoice.find(invoiceMatch).populate("party", "name").select("invoiceNo createdAt paymentMode amountPaid party"),
    Payment.find(paymentMatch).populate("party", "name"),
  ]);

  // An invoice's amountPaid also includes receipt money put on it later; only the rest was paid at
  // the counter (those receipts are counted on their own date below).
  const invoiceIds = invoices.map((inv) => inv._id);
  const fromReceipts = await Payment.aggregate([
    { $match: { status: "active", "allocations.invoice": { $in: invoiceIds } } },
    { $unwind: "$allocations" },
    { $match: { "allocations.invoice": { $in: invoiceIds } } },
    { $group: { _id: "$allocations.invoice", total: { $sum: "$allocations.amount" } } },
  ]);
  const receiptTotalByInvoice = new Map(fromReceipts.map((r) => [r._id.toString(), r.total]));

  const rows = [];
  for (const inv of invoices) {
    const amount = roundAmount(inv.amountPaid - (receiptTotalByInvoice.get(inv._id.toString()) || 0));
    if (amount <= 0) continue;
    rows.push({
      kind: "bill",
      id: inv._id,
      date: inv.createdAt,
      number: inv.invoiceNo,
      party: inv.party?.name || "",
      mode: inv.paymentMode,
      amount,
    });
  }
  for (const payment of receipts) {
    rows.push({
      kind: "receipt",
      id: payment._id,
      partyId: payment.party?._id,
      date: payment.receivedAt,
      number: payment.receiptNo,
      party: payment.party?.name || "",
      mode: payment.mode,
      reference: payment.reference,
      amount: payment.amount,
    });
  }
  rows.sort((a, b) => new Date(b.date) - new Date(a.date));

  const byMode = {};
  for (const row of rows) byMode[row.mode] = roundAmount((byMode[row.mode] || 0) + row.amount);

  res.json({
    rows,
    total: sum(rows, "amount"),
    atCounter: sum(rows.filter((r) => r.kind === "bill"), "amount"),
    fromReceipts: sum(rows.filter((r) => r.kind === "receipt"), "amount"),
    byMode,
  });
});

// GET /api/reports/gst?from=&to=
// Tax invoices only (bills without GST aren't part of GST returns), laid out the way GSTR-1 needs
// them: B2B (customer has a GSTIN) vs B2C, plus an HSN-wise summary.
export const gstReport = asyncHandler(async (req, res) => {
  const match = { status: { $ne: "voided" }, "items.gstRate": { $gt: 0 } };
  const range = dateRange(req.query.from, req.query.to);
  if (range) match.createdAt = range;

  const invoices = await Invoice.find(match).populate("party", "name gstin").sort({ createdAt: 1 });

  const rows = invoices.map((inv) => {
    // The customer's GSTIN as it was on the bill, so adding one later doesn't move old bills to B2B.
    const billedTo = billedToOf(inv);
    const gstin = billedTo?.gstin || "";
    return {
      id: inv._id,
      date: inv.createdAt,
      invoiceNo: inv.invoiceNo,
      party: billedTo?.name || "",
      gstin,
      type: gstin ? "B2B" : "B2C",
      supply: inv.isInterState ? "Inter-state" : "Intra-state",
      rate: inv.items[0]?.gstRate || 0,
      taxable: roundAmount(inv.subtotal - (inv.discountAmount || 0)),
      cgst: inv.cgst,
      sgst: inv.sgst,
      igst: inv.igst,
      totalTax: inv.totalTax,
      grandTotal: inv.grandTotal,
    };
  });

  function totalsOf(list) {
    return {
      invoices: list.length,
      taxable: sum(list, "taxable"),
      cgst: sum(list, "cgst"),
      sgst: sum(list, "sgst"),
      igst: sum(list, "igst"),
      totalTax: sum(list, "totalTax"),
      grandTotal: sum(list, "grandTotal"),
    };
  }

  // HSN summary: the invoice-level discount and tax are shared out over its lines in proportion to
  // each line's value, so the HSN totals add up to the invoice totals.
  const hsnMap = new Map();
  for (const inv of invoices) {
    if (!inv.subtotal) continue;
    const taxable = inv.subtotal - (inv.discountAmount || 0);
    for (const item of inv.items) {
      const share = (item.quantity * item.unitPrice) / inv.subtotal;
      const key = `${item.hsnCode || "—"}|${item.unit || "piece"}|${item.gstRate}`;
      if (!hsnMap.has(key)) {
        hsnMap.set(key, {
          hsnCode: item.hsnCode || "—",
          unit: item.unit || "piece",
          rate: item.gstRate,
          quantity: 0,
          taxable: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
        });
      }
      const h = hsnMap.get(key);
      h.quantity += item.quantity;
      h.taxable += taxable * share;
      h.cgst += inv.cgst * share;
      h.sgst += inv.sgst * share;
      h.igst += inv.igst * share;
    }
  }
  const hsn = [...hsnMap.values()].map((h) => ({
    ...h,
    taxable: roundAmount(h.taxable),
    cgst: roundAmount(h.cgst),
    sgst: roundAmount(h.sgst),
    igst: roundAmount(h.igst),
    totalTax: roundAmount(h.cgst + h.sgst + h.igst),
  }));

  res.json({
    rows,
    hsn,
    totals: totalsOf(rows),
    b2b: totalsOf(rows.filter((r) => r.type === "B2B")),
    b2c: totalsOf(rows.filter((r) => r.type === "B2C")),
  });
});
