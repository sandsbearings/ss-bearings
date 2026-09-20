import mongoose from "mongoose";

const purchaseItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true },
    costPrice: { type: Number, required: true },
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    purchaseNo: { type: String, required: true, unique: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Party", required: true },
    items: [purchaseItemSchema],
    totalAmount: { type: Number, required: true },
    receivedDate: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.model("Purchase", purchaseSchema);
