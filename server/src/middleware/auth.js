import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import User from "../models/User.js";

function unauthorized(res, message, code) {
  res.status(401);
  const err = new Error(message);
  if (code) err.code = code; // lets the app show why it logged out
  throw err;
}

export const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) unauthorized(res, "Not authorized, no token");

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    unauthorized(res, "Not authorized, token failed");
  }

  req.user = await User.findById(decoded.id).select("-password");
  if (!req.user || !req.user.isActive) unauthorized(res, "Not authorized, user inactive or not found");

  // A login from before the last password change/reset no longer counts.
  if (req.user.passwordChangedAt && decoded.iat * 1000 < req.user.passwordChangedAt.getTime()) {
    unauthorized(res, "Password was changed, please log in again", "PASSWORD_CHANGED");
  }
  // One login at a time: only the latest login's token is accepted. (Tokens from before this
  // rule have no sid; they keep working until the account's next login.)
  if ((decoded.sid ?? null) !== (req.user.sessionId ?? null)) {
    unauthorized(res, "This account was logged in on another device", "SESSION_REPLACED");
  }

  next();
});

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    res.status(403);
    throw new Error("Forbidden: insufficient role");
  }
  next();
};
