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
    creditBalance: { ...money, default: 0 }, // positive = they owe us (customer) or we owe supplier
  },
  { timestamps: true }
);

export default mongoose.model("Party", partySchema);
