import express from "express";
import { voidPayment } from "../controllers/paymentController.js";
import { protect, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);
router.post("/:id/void", requireRole("admin"), voidPayment);

export default router;
