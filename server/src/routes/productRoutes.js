import express from "express";
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  bulkUpsertProducts,
  lookupProductsByBearingNumber,
} from "../controllers/productController.js";
import { protect, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);
router.get("/", listProducts);
router.post("/lookup", requireRole("admin"), lookupProductsByBearingNumber);
router.post("/bulk", requireRole("admin"), bulkUpsertProducts);
router.get("/:id", getProduct);
router.post("/", requireRole("admin"), createProduct);
router.put("/:id", requireRole("admin"), updateProduct);
router.delete("/:id", requireRole("admin"), deleteProduct);

export default router;
