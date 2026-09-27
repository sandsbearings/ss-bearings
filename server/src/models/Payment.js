import mongoose from "mongoose";
import { money } from "../utils/money.js";

// Where a receipt's money went: a specific invoice, or (no invoice) the party's opening balance.
const allocationSchema = new mongoose.Schema(
  {
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
    amount: { ...money, required: true },
  },
  { _id: false }
);

// A payment received from a customer against their credit. Money is matched to their oldest unpaid
// bills first (or a bill the cashier picks); whatever is left over waits in `unallocated` as an
// advance and is used up automatically by their next credit bill. See utils/creditLedger.js.
const paymentSchema = new mongoose.Schema(
  {
    receiptNo: { type: String, required: true, unique: true },
    party: { type: mongoose.Schema.Types.ObjectId, ref: "Party", required: true },
    amount: { ...money, required: true },
    mode: { type: String, enum: ["cash", "upi", "card", "bank", "cheque", "other"], default: "cash" },
    reference: { type: String, trim: true }, // UPI UTR, cheque no., etc.
    note: { type: String, trim: true },
    receivedAt: { type: Date, required: true, default: Date.now },

    allocations: [allocationSchema],
    unallocated: { ...money, default: 0 }, // advance not yet applied to any bill

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    status: { type: String, enum: ["active", "voided"], default: "active" },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

paymentSchema.index({ party: 1, status: 1, receivedAt: 1 });
paymentSchema.index({ "allocations.invoice": 1 });

export default mongoose.model("Payment", paymentSchema);
