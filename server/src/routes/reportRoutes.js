import express from "express";
import {
  lowStockReport,
  stockValuationReport,
  salesReport,
} from "../controllers/reportController.js";
import { protect, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(protect, requireRole("admin"));
router.get("/low-stock", lowStockReport);
router.get("/stock-valuation", stockValuationReport);
router.get("/sales", salesReport);

export default router;
