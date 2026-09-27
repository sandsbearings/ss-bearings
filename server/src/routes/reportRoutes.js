import express from "express";
import {
  lowStockReport,
  stockValuationReport,
  salesReport,
  outstandingReport,
  collectionsReport,
  gstReport,
  partySalesReport,
  inactiveCustomersReport,
} from "../controllers/reportController.js";
import { protect, requireRole } from "../middleware/auth.js";
import { requireReportsPass } from "../controllers/reportsPinController.js";

const router = express.Router();

router.use(protect, requireRole("admin"));
// Low stock is also shown on the Dashboard and has no money figures, so it stays outside the PIN.
router.get("/low-stock", lowStockReport);

// Everything below needs the Reports PIN (a reports pass from /api/reports-pin/verify).
router.use(requireReportsPass);
router.get("/stock-valuation", stockValuationReport);
router.get("/sales", salesReport);
router.get("/outstanding", outstandingReport);
router.get("/collections", collectionsReport);
router.get("/gst", gstReport);
router.get("/parties", partySalesReport);
router.get("/inactive", inactiveCustomersReport);

export default router;
