import express from "express";
import { createPurchase, listPurchases } from "../controllers/purchaseController.js";
import { protect, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(protect, requireRole("admin"));
router.get("/", listPurchases);
router.post("/", createPurchase);

export default router;
