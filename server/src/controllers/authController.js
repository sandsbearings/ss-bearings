import crypto from "crypto";
import asyncHandler from "express-async-handler";
import User from "../models/User.js";
import { endSession, startSession } from "../utils/generateToken.js";
import { sendEmail } from "../utils/sendEmail.js";
import { company } from "../config/company.js";

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
    token: await startSession(user),
  });
});

const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MINUTES = 15;

// POST /api/auth/login
// After MAX_LOGIN_FAILURES wrong passwords in a row, the account pauses logins for
// LOGIN_LOCK_MINUTES, so a password can't be guessed by trying again and again.
export const login = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const email = (req.body.email || "").trim().toLowerCase();
  const user = await User.findOne({ email }).select("+loginFailures +loginLockedUntil");

  if (user?.loginLockedUntil && user.loginLockedUntil > new Date()) {
    const minutes = Math.ceil((user.loginLockedUntil - Date.now()) / 60000);
    res.status(429);
    throw new Error(`Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or reset your password.`);
  }

  if (!user || !(await user.comparePassword(password))) {
    if (user) {
      user.loginFailures = (user.loginFailures || 0) + 1;
      if (user.loginFailures >= MAX_LOGIN_FAILURES) {
        user.loginFailures = 0;
        user.loginLockedUntil = new Date(Date.now() + LOGIN_LOCK_MINUTES * 60000);
      }
      await user.save({ validateBeforeSave: false });
    }
    res.status(401);
    throw new Error("Invalid email or password");
  }
  if (!user.isActive) {
    res.status(403);
    throw new Error("Account is disabled");
  }
  if (user.loginFailures || user.loginLockedUntil) {
    user.loginFailures = 0;
    user.loginLockedUntil = undefined;
    await user.save({ validateBeforeSave: false });
  }

  res.json({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    token: await startSession(user),
  });
});

// POST /api/auth/logout
// Cancels this login on the server too, so the token can't be reused even if it was copied.
export const logout = asyncHandler(async (req, res) => {
  await endSession(req.user);
  res.json({ message: "Logged out" });
});

// GET /api/auth/me
export const me = asyncHandler(async (req, res) => {
  res.json(req.user);
});

const RESET_LINK_MINUTES = 60;
const RESET_EMAIL_GAP_MINUTES = 2; // at most one reset email per account in this time

const hashToken = (raw) => crypto.createHash("sha256").update(String(raw || "")).digest("hex");

// Creates the reset link and emails it. Runs after the response is sent (see forgotPassword).
async function sendResetEmail(email) {
  const user = await User.findOne({ email }).select("+resetPasswordRequestedAt");
  if (!user || !user.isActive) return; // disabled accounts can't log in, so no reset either
  if (!process.env.CLIENT_ORIGIN) {
    console.error("CLIENT_ORIGIN is not set, so the password reset link can't be built.");
    return;
  }
  // Stops someone flooding an inbox (and using up Gmail's daily sending limit) with reset emails.
  if (user.resetPasswordRequestedAt && Date.now() - user.resetPasswordRequestedAt < RESET_EMAIL_GAP_MINUTES * 60000) {
    return;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  user.resetPasswordToken = hashToken(rawToken);
  user.resetPasswordExpires = Date.now() + RESET_LINK_MINUTES * 60000;
  user.resetPasswordRequestedAt = new Date();
  await user.save({ validateBeforeSave: false });

  // The secret goes after "#": browsers never send that part to any server, so it can't end up
  // in Vercel's or Render's request logs.
  const resetUrl = `${process.env.CLIENT_ORIGIN}/reset-password#${rawToken}`;
  try {
    await sendEmail({
      to: user.email,
      subject: `${company.name}: reset your password`,
      text:
        `Hello ${user.name},\n\nWe received a request to reset your password for ${company.name}.\n` +
        `Open this link to choose a new password (it works once and expires in 1 hour):\n\n${resetUrl}\n\n` +
        `If you didn't ask for this, you can ignore this email; your password stays the same.`,
      html: `<p>Hello ${escapeHtml(user.name)},</p>
             <p>We received a request to reset your password for ${escapeHtml(company.name)}.</p>
             <p><a href="${resetUrl}">Choose a new password</a></p>
             <p>This link works once and expires in 1 hour. If the button doesn't work, copy this link into your browser:<br>${resetUrl}</p>
             <p>If you didn't ask for this, you can ignore this email; your password stays the same.</p>`,
    });
  } catch (err) {
    // Don't leave a valid link behind for an email that never arrived.
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.resetPasswordRequestedAt = undefined;
    await user.save({ validateBeforeSave: false });
    throw err;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// POST /api/auth/forgot-password
// Always answers straight away with the same message, whether or not the email is registered,
// and does the work afterwards — so neither the message nor the response time reveals which
// staff emails exist.
export const forgotPassword = asyncHandler(async (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  res.json({ message: "If an account with that email exists, a password reset link has been sent." });
  sendResetEmail(email).catch((err) => console.error("Failed to send password reset email:", err));
});

async function findByResetToken(token) {
  return User.findOne({ resetPasswordToken: hashToken(token), resetPasswordExpires: { $gt: Date.now() } });
}

// POST /api/auth/reset-password/check   body: { token }  ->  { valid }
// Lets the reset page say "this link has expired" before the user types a new password.
export const checkResetToken = asyncHandler(async (req, res) => {
  res.json({ valid: Boolean(req.body.token && (await findByResetToken(req.body.token))) });
});

// POST /api/auth/reset-password   body: { token, password }
// The token travels in the body (not the address) so it never appears in server logs.
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!password || password.length < 6) {
    res.status(400);
    throw new Error("Password must be at least 6 characters");
  }

  const user = token ? await findByResetToken(token) : null;
  if (!user) {
    res.status(400);
    throw new Error("Password reset link is invalid or has expired");
  }

  user.password = password; // pre("save") hashes it and logs out every other device
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  user.loginFailures = 0; // a reset also lifts any wrong-password pause
  user.loginLockedUntil = undefined;
  await user.save();

  res.json({ message: "Password has been reset successfully" });
});
