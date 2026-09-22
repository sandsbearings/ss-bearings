import mongoose from "mongoose";
import { money } from "../utils/money.js";

const purchaseItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true },
    costPrice: { ...money, required: true },
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    purchaseNo: { type: String, required: true, unique: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Party", required: true },
    items: [purchaseItemSchema],
    totalAmount: { ...money, required: true },
    receivedDate: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.model("Purchase", purchaseSchema);
