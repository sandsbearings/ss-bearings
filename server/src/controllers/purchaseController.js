import asyncHandler from "express-async-handler";
import Purchase from "../models/Purchase.js";
import Product from "../models/Product.js";
import StockMovement from "../models/StockMovement.js";
import { nextSequence } from "../models/Counter.js";
import Party from "../models/Party.js";
import { getPagination, buildPage } from "../utils/paginate.js";

// POST /api/purchases
// body: { supplierId, items: [{ productId, quantity, costPrice }] }
export const createPurchase = asyncHandler(async (req, res) => {
  const { supplierId, items } = req.body;

  if (!items?.length) {
    res.status(400);
    throw new Error("Purchase must have at least one item");
  }

  const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.costPrice, 0);
  const seq = await nextSequence("purchase");
  const purchaseNo = `PUR-${String(seq).padStart(5, "0")}`;

  const purchase = await Purchase.create({
    purchaseNo,
    supplier: supplierId,
    items: items.map((i) => ({ product: i.productId, quantity: i.quantity, costPrice: i.costPrice })),
    totalAmount,
    createdBy: req.user._id,
  });

  for (const item of items) {
    await Product.findByIdAndUpdate(item.productId, {
      $inc: { currentStock: item.quantity },
      $set: { costPrice: item.costPrice },
    });
    await StockMovement.create({
      product: item.productId,
      type: "purchase",
      quantity: item.quantity,
      reference: purchaseNo,
      createdBy: req.user._id,
    });
  }

  res.status(201).json(purchase);
});

// GET /api/purchases?search=&page=&limit=
export const listPurchases = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const query = {};

  if (search) {
    const matchingSuppliers = await Party.find({ name: new RegExp(search, "i") }).select("_id");
    query.$or = [
      { purchaseNo: new RegExp(search, "i") },
      { supplier: { $in: matchingSuppliers.map((p) => p._id) } },
    ];
  }

  const { page, limit, skip } = getPagination(req.query);
  const [purchases, total] = await Promise.all([
    Purchase.find(query).populate("supplier", "name phone").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Purchase.countDocuments(query),
  ]);
  res.json(buildPage(purchases, total, page, limit));
});
