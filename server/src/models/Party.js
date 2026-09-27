import mongoose from "mongoose";
import { money } from "../utils/money.js";

const partySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["customer", "supplier"], required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    gstin: { type: String, trim: true, uppercase: true },
    pan: { type: String, trim: true, uppercase: true },
    address: { type: String, trim: true },
    // Customer: what they owe us right now — unpaid bills + unpaid opening balance, minus any advance
    // (so negative = advance). Only invoices and payments change it; never edited directly.
    creditBalance: { ...money, default: 0 },

    // Dues carried over from before this system (old khata), treated as the customer's oldest bill.
    openingBalance: { ...money, default: 0 },
    openingPaid: { ...money, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Party", partySchema);
