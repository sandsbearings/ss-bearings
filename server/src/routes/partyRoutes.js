import express from "express";
import {
  listParties,
  listAllParties,
  getParty,
  createParty,
  updateParty,
  deleteParty,
} from "../controllers/partyController.js";
import { receivePayment, getOpenBills, getStatement } from "../controllers/paymentController.js";
import { protect, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);
router.get("/", listParties);
router.get("/all", listAllParties);
router.get("/:id", getParty);
router.post("/", createParty);
router.put("/:id", updateParty);
router.delete("/:id", requireRole("admin"), deleteParty);
router.get("/:id/statement", getStatement);
router.get("/:id/open-bills", getOpenBills);
router.post("/:id/payments", receivePayment);

export default router;
