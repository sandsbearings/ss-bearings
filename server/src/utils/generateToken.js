import crypto from "crypto";
import jwt from "jsonwebtoken";

export function generateToken(userId, sessionId) {
  return jwt.sign({ id: userId, sid: sessionId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

// One login at a time: every login gets a fresh session id, saved on the user and put in the
// token. middleware/auth.js only accepts the token with the current id, so logging in on a new
// device logs the previous one out.
export async function startSession(user) {
  user.sessionId = crypto.randomBytes(16).toString("hex");
  await user.save({ validateBeforeSave: false });
  return generateToken(user._id, user.sessionId);
}

// Logout: a new random id that no token carries, so the old token stops working on the server
// too (not just forgotten by the browser).
export async function endSession(user) {
  user.sessionId = crypto.randomBytes(16).toString("hex");
  await user.save({ validateBeforeSave: false });
}
