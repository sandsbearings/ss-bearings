import crypto from "crypto";
import asyncHandler from "express-async-handler";
import User from "../models/User.js";
import { generateToken } from "../utils/generateToken.js";
import { sendEmail } from "../utils/sendEmail.js";

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
  const { password } = req.body;
  const email = (req.body.email || "").trim().toLowerCase();
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

// POST /api/auth/forgot-password
// Always responds with the same generic message, whether or not the email is registered,
// so this endpoint can't be used to discover which staff emails exist in the system.
export const forgotPassword = asyncHandler(async (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const user = await User.findOne({ email });

  if (user) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.CLIENT_ORIGIN}/reset-password/${rawToken}`;
    try {
      await sendEmail({
        to: user.email,
        subject: "Reset your password",
        html: `<p>Click the link below to reset your password. This link expires in 1 hour.</p>
               <p><a href="${resetUrl}">${resetUrl}</a></p>
               <p>If you didn't request this, you can safely ignore this email.</p>`,
      });
    } catch (err) {
      // Don't let a broken send leave a valid dangling token, and don't leak the failure to the
      // client — that would itself confirm the email exists.
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });
      console.error("Failed to send password reset email:", err);
    }
  }

  res.json({ message: "If an account with that email exists, a password reset link has been sent." });
});

// POST /api/auth/reset-password/:token
export const resetPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    res.status(400);
    throw new Error("Password must be at least 6 characters");
  }

  const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");
  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400);
    throw new Error("Password reset link is invalid or has expired");
  }

  user.password = password; // pre("save") hook hashes it
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  res.json({ message: "Password has been reset successfully" });
});
