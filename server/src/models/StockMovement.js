import mongoose from "mongoose";

const stockMovementSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    type: { type: String, enum: ["purchase", "sale", "adjustment", "return"], required: true },
    quantity: { type: Number, required: true }, // always positive; sign implied by type
    reference: { type: String, trim: true }, // invoice/purchase number
    note: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.model("StockMovement", stockMovementSchema);
