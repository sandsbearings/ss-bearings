import asyncHandler from "express-async-handler";
import Category from "../models/Category.js";
import { getPagination, buildPage } from "../utils/paginate.js";

// GET /api/categories?search=&page=&limit=  (paginated, for the Categories admin list)
export const listCategories = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const query = {};
  if (search) query.name = new RegExp(search, "i");

  const { page, limit, skip } = getPagination(req.query);
  const [categories, total] = await Promise.all([
    Category.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Category.countDocuments(query),
  ]);
  res.json(buildPage(categories, total, page, limit));
});

// GET /api/categories/all  (full list, for the Products form dropdown)
export const listAllCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find().sort({ name: 1 });
  res.json(categories);
});

// POST /api/categories
export const createCategory = asyncHandler(async (req, res) => {
  const { name, description, imageUrl } = req.body;
  const existing = await Category.findOne({ name });
  if (existing) {
    res.status(400);
    throw new Error("Category already exists");
  }
  const category = await Category.create({ name, description, imageUrl });
  res.status(201).json(category);
});

// PUT /api/categories/:id
export const updateCategory = asyncHandler(async (req, res) => {
  const { name, description, imageUrl } = req.body;
  const category = await Category.findByIdAndUpdate(
    req.params.id,
    { name, description, imageUrl },
    { new: true, runValidators: true }
  );
  if (!category) {
    res.status(404);
    throw new Error("Category not found");
  }
  res.json(category);
});

// DELETE /api/categories/:id
export const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) {
    res.status(404);
    throw new Error("Category not found");
  }
  res.json({ message: "Category deleted" });
});
