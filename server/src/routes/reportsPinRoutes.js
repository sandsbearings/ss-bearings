import express from "express";
import { pinStatus, setPin, verifyPin } from "../controllers/reportsPinController.js";
import { protect, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(protect, requireRole("admin"));
router.get("/status", pinStatus);
router.post("/", setPin);
router.post("/verify", verifyPin);

export default router;
