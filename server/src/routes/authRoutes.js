import express from "express";
import {
  register,
  login,
  me,
  logout,
  forgotPassword,
  checkResetToken,
  resetPassword,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/check", checkResetToken);
router.post("/reset-password", resetPassword);
router.get("/me", protect, me);
router.post("/logout", protect, logout);

export default router;
