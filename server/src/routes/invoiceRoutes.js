import express from "express";
import {
  createInvoice,
  listInvoices,
  getInvoice,
  getInvoicePdf,
  updateInvoice,
  voidInvoice,
} from "../controllers/invoiceController.js";
import { protect, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);
router.get("/", listInvoices);
router.post("/", createInvoice);
router.get("/:id", getInvoice);
router.get("/:id/pdf", getInvoicePdf);
router.put("/:id", requireRole("admin"), updateInvoice);
router.post("/:id/void", requireRole("admin"), voidInvoice);

export default router;
