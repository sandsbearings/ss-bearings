import asyncHandler from "express-async-handler";
import Brand from "../models/Brand.js";
import { getPagination, buildPage } from "../utils/paginate.js";

// GET /api/brands?search=&page=&limit=  (paginated, for the Brands admin list)
export const listBrands = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const query = {};
  if (search) query.name = new RegExp(search, "i");

  const { page, limit, skip } = getPagination(req.query);
  const [brands, total] = await Promise.all([
    Brand.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Brand.countDocuments(query),
  ]);
  res.json(buildPage(brands, total, page, limit));
});

// GET /api/brands/all  (full list, for the Products form dropdown)
export const listAllBrands = asyncHandler(async (req, res) => {
  const brands = await Brand.find().sort({ name: 1 });
  res.json(brands);
});

// POST /api/brands
export const createBrand = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const existing = await Brand.findOne({ name });
  if (existing) {
    res.status(400);
    throw new Error("Brand already exists");
  }
  const brand = await Brand.create({ name });
  res.status(201).json(brand);
});

// PUT /api/brands/:id
export const updateBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.findByIdAndUpdate(
    req.params.id,
    { name: req.body.name },
    { new: true, runValidators: true }
  );
  if (!brand) {
    res.status(404);
    throw new Error("Brand not found");
  }
  res.json(brand);
});

// DELETE /api/brands/:id
export const deleteBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.findByIdAndDelete(req.params.id);
  if (!brand) {
    res.status(404);
    throw new Error("Brand not found");
  }
  res.json({ message: "Brand deleted" });
});
