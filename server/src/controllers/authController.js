import asyncHandler from "express-async-handler";
import User from "../models/User.js";
import { generateToken } from "../utils/generateToken.js";

// POST /api/auth/register  (bootstrap-only: works once, to create the first admin)
export const register = asyncHandler(async (req, res) => {
  const userCount = await User.countDocuments();
  if (userCount > 0) {
    res.status(403);
    throw new Error("Registration is closed. Ask an admin to create your account from the Users page.");
  }

  const { name, email, password } = req.body;
  const user = await User.create({ name, email, password, role: "admin" });

  res.status(201).json({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    token: generateToken(user._id),
  });
});

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user || !(await user.comparePassword(password))) {
    res.status(401);
    throw new Error("Invalid email or password");
  }
  if (!user.isActive) {
    res.status(403);
    throw new Error("Account is disabled");
  }

  res.json({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    token: generateToken(user._id),
  });
});

// GET /api/auth/me
export const me = asyncHandler(async (req, res) => {
  res.json(req.user);
});
