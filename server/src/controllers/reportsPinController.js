import asyncHandler from "express-async-handler";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Reports are behind a second check: each admin sets a 4–6 digit Reports PIN, and opening Reports
// asks for it every time. A correct PIN returns a short-lived "reports pass" that every
// /api/reports request must carry (X-Reports-Pass header) — so the lock holds on the server, not
// just in the admin app. The app keeps the pass only while the Reports page is open.

const PIN_PATTERN = /^\d{4,6}$/;
const MAX_FAILURES = 5; // wrong PINs (or passwords, when setting one) before a pause
const LOCK_MINUTES = 15;
const PASS_LIFETIME = "30m"; // safety net; the app also drops the pass on leaving Reports

// Signed with a different secret from the login token, so neither can stand in for the other.
const passSecret = () => `${process.env.JWT_SECRET}:reports-pass`;

function loadPinUser(id) {
  return User.findById(id).select(
    "+password +reportsPinHash +reportsPinChangedAt +reportsPinFailures +reportsPinLockedUntil"
  );
}

function assertNotLocked(res, user) {
  if (user.reportsPinLockedUntil && user.reportsPinLockedUntil > new Date()) {
    const minutes = Math.ceil((user.reportsPinLockedUntil - Date.now()) / 60000);
    res.status(429);
    throw new Error(`Too many wrong tries. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }
}

// Counts a wrong PIN/password; after MAX_FAILURES, pauses tries for LOCK_MINUTES.
async function recordFailure(res, user, what) {
  user.reportsPinFailures = (user.reportsPinFailures || 0) + 1;
  const left = MAX_FAILURES - user.reportsPinFailures;
  if (left <= 0) {
    user.reportsPinFailures = 0;
    user.reportsPinLockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
  }
  await user.save();
  res.status(401);
  throw new Error(
    left <= 0
      ? `Wrong ${what}. Too many wrong tries — try again in ${LOCK_MINUTES} minutes.`
      : `Wrong ${what}. ${left} tr${left === 1 ? "y" : "ies"} left.`
  );
}

// GET /api/reports-pin/status
export const pinStatus = asyncHandler(async (req, res) => {
  const user = await loadPinUser(req.user._id);
  res.json({ hasPin: Boolean(user.reportsPinHash) });
});

// POST /api/reports-pin   body: { password, pin }
// Sets, changes or resets (forgotten) the PIN. Always needs the login password.
export const setPin = asyncHandler(async (req, res) => {
  const { password, pin } = req.body;
  if (!PIN_PATTERN.test(String(pin || ""))) {
    res.status(400);
    throw new Error("PIN must be 4 to 6 digits");
  }

  const user = await loadPinUser(req.user._id);
  assertNotLocked(res, user);
  if (!password || !(await user.comparePassword(password))) await recordFailure(res, user, "password");

  user.reportsPinHash = await bcrypt.hash(String(pin), 10);
  user.reportsPinChangedAt = new Date();
  user.reportsPinFailures = 0;
  user.reportsPinLockedUntil = undefined;
  await user.save();
  res.json({ message: "Reports PIN saved" });
});

// POST /api/reports-pin/verify   body: { pin }  ->  { reportsPass }
export const verifyPin = asyncHandler(async (req, res) => {
  const user = await loadPinUser(req.user._id);
  if (!user.reportsPinHash) {
    res.status(400);
    throw new Error("Set a Reports PIN first");
  }
  assertNotLocked(res, user);
  if (!(await bcrypt.compare(String(req.body.pin || ""), user.reportsPinHash))) {
    await recordFailure(res, user, "PIN");
  }

  if (user.reportsPinFailures || user.reportsPinLockedUntil) {
    user.reportsPinFailures = 0;
    user.reportsPinLockedUntil = undefined;
    await user.save();
  }
  const reportsPass = jwt.sign(
    { id: user._id.toString(), pv: user.reportsPinChangedAt.getTime() },
    passSecret(),
    { expiresIn: PASS_LIFETIME }
  );
  res.json({ reportsPass });
});

// Middleware for /api/reports: needs a valid reports pass for this user, issued since their PIN
// was last set. Fails with code REPORTS_LOCKED so the app knows to ask for the PIN again.
export const requireReportsPass = asyncHandler(async (req, res, next) => {
  const locked = (message) => {
    res.status(403);
    const err = new Error(message);
    err.code = "REPORTS_LOCKED";
    throw err;
  };

  const pass = req.headers["x-reports-pass"];
  if (!pass) locked("Reports are locked. Enter your Reports PIN.");

  let decoded;
  try {
    decoded = jwt.verify(pass, passSecret());
  } catch {
    locked("Reports locked again for safety. Enter your Reports PIN.");
  }

  const user = await loadPinUser(req.user._id);
  if (decoded.id !== req.user._id.toString() || decoded.pv !== user.reportsPinChangedAt?.getTime()) {
    locked("Reports are locked. Enter your Reports PIN.");
  }
  next();
});
