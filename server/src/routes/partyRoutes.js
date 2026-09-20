import express from "express";
import {
  listParties,
  listAllParties,
  getParty,
  createParty,
  updateParty,
  deleteParty,
} from "../controllers/partyController.js";
import { protect, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);
router.get("/", listParties);
router.get("/all", listAllParties);
router.get("/:id", getParty);
router.post("/", createParty);
router.put("/:id", updateParty);
router.delete("/:id", requireRole("admin"), deleteParty);

export default router;
