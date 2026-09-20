import asyncHandler from "express-async-handler";
import Product from "../models/Product.js";
import StockMovement from "../models/StockMovement.js";
import Brand from "../models/Brand.js";
import Category from "../models/Category.js";
import { getPagination, buildPage } from "../utils/paginate.js";

const MAX_BULK_ROWS = 500;

// Returns undefined for "leave unset" (blank cell), a finite number, or NaN to signal an invalid value.
function toOptionalNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

// GET /api/products?search=&lowStock=true&family=&page=&limit=
export const listProducts = asyncHandler(async (req, res) => {
  const { search, lowStock, family } = req.query;
  const query = {};

  if (search) {
    query.$or = [
      { bearingNumber: new RegExp(search, "i") },
      { crossRefNumbers: new RegExp(search, "i") },
    ];
  }
  if (lowStock === "true") {
    query.$expr = { $lte: ["$currentStock", "$reorderLevel"] };
  }
  if (family) {
    query.family = family;
  }

  const { page, limit, skip } = getPagination(req.query);
  const [products, total] = await Promise.all([
    Product.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Product.countDocuments(query),
  ]);
  res.json(buildPage(products, total, page, limit));
});

// GET /api/products/:id
export const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }
  res.json(product);
});

// POST /api/products
export const createProduct = asyncHandler(async (req, res) => {
  const product = await Product.create(req.body);
  res.status(201).json(product);
});

// PUT /api/products/:id
export const updateProduct = asyncHandler(async (req, res) => {
  const before = await Product.findById(req.params.id);
  if (!before) {
    res.status(404);
    throw new Error("Product not found");
  }

  const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  // Manual stock edits (as opposed to sales/purchases) are logged as adjustments
  // so StockMovement stays the single source of truth for stock history.
  const diff = product.currentStock - before.currentStock;
  if (diff !== 0) {
    await StockMovement.create({
      product: product._id,
      type: "adjustment",
      quantity: Math.abs(diff),
      note: `Manual edit: ${diff > 0 ? "+" : ""}${diff}`,
      createdBy: req.user._id,
    });
  }

  res.json(product);
});

// DELETE /api/products/:id
export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }
  res.json({ message: "Product deleted" });
});

// POST /api/products/lookup  (admin only — bulk upload preview: fetch current values for
// bearing numbers already in the sheet, so the client can flag conflicts before importing)
// body: { bearingNumbers: [string, ...] }
export const lookupProductsByBearingNumber = asyncHandler(async (req, res) => {
  const { bearingNumbers } = req.body;
  if (!bearingNumbers?.length) {
    res.json([]);
    return;
  }

  const normalized = [
    ...new Set(bearingNumbers.map((b) => String(b || "").trim().toUpperCase()).filter(Boolean)),
  ];
  if (normalized.length > MAX_BULK_ROWS) {
    res.status(400);
    throw new Error(`Cannot look up more than ${MAX_BULK_ROWS} bearing numbers at once`);
  }

  const products = await Product.find({ bearingNumber: { $in: normalized } }).select(
    "bearingNumber brand family currentStock"
  );
  res.json(products);
});

// POST /api/products/bulk  (admin only — spreadsheet import; upserts by bearingNumber)
// body: { rows: [{ bearingNumber, brand, family, description, weight, hsnCode,
//                   costPrice, retailPrice, wholesalePrice, currentStock, reorderLevel }, ...] }
// The client resolves brand/family against existing Brand/Category names before submitting,
// but we re-validate here too — request bodies are never trusted just because the UI sent them.
// brand is optional: blank defaults new products to "Generic" and leaves existing ones untouched
// on update (schema default vs. left-out-of-$set, same as the other optional fields below).
export const bulkUpsertProducts = asyncHandler(async (req, res) => {
  const { rows } = req.body;

  if (!rows?.length) {
    res.status(400);
    throw new Error("No rows to import");
  }
  if (rows.length > MAX_BULK_ROWS) {
    res.status(400);
    throw new Error(`Cannot import more than ${MAX_BULK_ROWS} rows at once`);
  }

  const [brands, categories] = await Promise.all([
    Brand.find().select("name"),
    Category.find().select("name"),
  ]);
  const brandByLower = new Map(brands.map((b) => [b.name.toLowerCase(), b.name]));
  const categoryByLower = new Map(categories.map((c) => [c.name.toLowerCase(), c.name]));

  const results = [];
  let created = 0;
  let updated = 0;
  let errors = 0;

  function fail(bearingNumber, message) {
    errors++;
    results.push({ bearingNumber: bearingNumber || "(blank)", status: "error", message });
  }

  for (const row of rows) {
    const bearingNumber = String(row.bearingNumber || "").trim().toUpperCase();
    if (!bearingNumber) {
      fail(bearingNumber, "Bearing number is required");
      continue;
    }

    // Brand is optional: blank means "default to Generic on create, leave unchanged on update"
    // (handled below by simply omitting it from $set). A *given* brand still has to be real.
    const brandInput = String(row.brand || "").trim();
    let resolvedBrand;
    if (brandInput) {
      resolvedBrand = brandByLower.get(brandInput.toLowerCase());
      if (!resolvedBrand) {
        fail(bearingNumber, `Unknown brand "${row.brand}"`);
        continue;
      }
    }

    // Category is optional the same way brand is: blank means "default to uncategorized on
    // create, leave unchanged on update" (omitted from $set below). A *given* category still
    // has to be real.
    const familyInput = String(row.family || "").trim();
    let resolvedFamily;
    if (familyInput) {
      resolvedFamily = categoryByLower.get(familyInput.toLowerCase());
      if (!resolvedFamily) {
        fail(bearingNumber, `Unknown category "${row.family}"`);
        continue;
      }
    }

    // currentStock is handled separately from the other numeric fields below — on an existing
    // product it's added to what's already there (a restock count), not an absolute overwrite.
    const numericFields = {};
    const numericError = ["costPrice", "retailPrice", "wholesalePrice", "currentStock", "reorderLevel", "weight"].reduce(
      (err, field) => {
        if (err) return err;
        const n = toOptionalNumber(row[field]);
        if (n === undefined) return null;
        if (Number.isNaN(n) || n < 0) return `Invalid ${field}`;
        numericFields[field] = n;
        return null;
      },
      null
    );
    if (numericError) {
      fail(bearingNumber, numericError);
      continue;
    }
    const { currentStock: stockInput, ...restNumericFields } = numericFields;

    const set = { ...restNumericFields };
    if (resolvedBrand) set.brand = resolvedBrand;
    if (resolvedFamily !== undefined) set.family = resolvedFamily;
    if (row.description) set.description = String(row.description).trim();
    if (row.hsnCode) set.hsnCode = String(row.hsnCode).trim();

    try {
      const before = await Product.findOne({ bearingNumber }).select("currentStock");

      const update = { $set: set };
      if (stockInput !== undefined) {
        // New product: the sheet value is the opening stock. Existing product: add to current stock
        // (e.g. 4 on hand + 25 in the sheet = 29), same as receiving a purchase.
        if (before) update.$inc = { currentStock: stockInput };
        else set.currentStock = stockInput;
      }

      const product = await Product.findOneAndUpdate({ bearingNumber }, update, {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      });

      if (before) {
        const diff = product.currentStock - before.currentStock;
        if (diff !== 0) {
          await StockMovement.create({
            product: product._id,
            type: "adjustment",
            quantity: Math.abs(diff),
            note: `Bulk import: ${diff > 0 ? "+" : ""}${diff}`,
            createdBy: req.user._id,
          });
        }
        updated++;
        results.push({ bearingNumber, status: "updated" });
      } else {
        created++;
        results.push({ bearingNumber, status: "created" });
      }
    } catch (err) {
      fail(bearingNumber, err.message);
    }
  }

  res.status(200).json({ summary: { created, updated, errors }, results });
});
