import asyncHandler from "express-async-handler";
import User from "../models/User.js";
import { getPagination, buildPage } from "../utils/paginate.js";

// GET /api/users?search=&page=&limit=
export const listUsers = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const query = {};
  if (search) {
    query.$or = [{ name: new RegExp(search, "i") }, { email: new RegExp(search, "i") }];
  }

  const { page, limit, skip } = getPagination(req.query);
  const [users, total] = await Promise.all([
    User.find(query).select("-password").sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(query),
  ]);
  res.json(buildPage(users, total, page, limit));
});

// POST /api/users  (admin creates a staff or admin account)
export const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    res.status(400);
    throw new Error("Email already registered");
  }

  const user = await User.create({
    name,
    email,
    password,
    role: role === "admin" ? "admin" : "staff",
  });

  res.status(201).json({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  });
});

// PUT /api/users/:id  (toggle role / isActive)
export const updateUser = asyncHandler(async (req, res) => {
  const { role, isActive } = req.body;
  const update = {};
  if (role) update.role = role;
  if (typeof isActive === "boolean") update.isActive = isActive;

  const user = await User.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true,
  }).select("-password");

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  res.json(user);
});

// DELETE /api/users/:id
export const deleteUser = asyncHandler(async (req, res) => {
  if (req.params.id === req.user._id.toString()) {
    res.status(400);
    throw new Error("You cannot delete your own account");
  }
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  res.json({ message: "User deleted" });
});
