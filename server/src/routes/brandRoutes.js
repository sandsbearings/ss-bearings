import express from "express";
import { listBrands, listAllBrands, createBrand, updateBrand, deleteBrand } from "../controllers/brandController.js";
import { protect, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);
router.get("/", listBrands);
router.get("/all", listAllBrands);
router.post("/", requireRole("admin"), createBrand);
router.put("/:id", requireRole("admin"), updateBrand);
router.delete("/:id", requireRole("admin"), deleteBrand);

export default router;
