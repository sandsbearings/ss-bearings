import asyncHandler from "express-async-handler";
import Product from "../models/Product.js";
import Invoice from "../models/Invoice.js";
import { getPagination, buildPage } from "../utils/paginate.js";
import { roundAmount } from "../utils/money.js";

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

// GET /api/reports/sales?from=&to=&page=&limit=
export const salesReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  // $ne (not "status: active") so invoices from before the voided-status field existed —
  // which have no status stored at all — still count as active rather than being dropped.
  const match = { status: { $ne: "voided" } };
  if (from || to) {
    match.createdAt = {};
    // `to` must reach the end of that day, not just midnight — otherwise a single-day range
    // (from === to) collapses to one instant and matches nothing. Same pattern as listInvoices.
    if (from) match.createdAt.$gte = new Date(`${from}T00:00:00.000`);
    if (to) match.createdAt.$lte = new Date(`${to}T23:59:59.999`);
  }

  const { page, limit, skip } = getPagination(req.query);
  const [invoices, total, totals] = await Promise.all([
    Invoice.find(match).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Invoice.countDocuments(match),
    Invoice.aggregate([
      { $match: match },
      { $group: { _id: null, totalSales: { $sum: "$grandTotal" }, totalTax: { $sum: "$totalTax" } } },
    ]),
  ]);
  const { totalSales = 0, totalTax = 0 } = totals[0] || {};

  res.json({
    ...buildPage(invoices, total, page, limit),
    totalSales: roundAmount(totalSales),
    totalTax: roundAmount(totalTax),
  });
});
