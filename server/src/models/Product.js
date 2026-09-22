import mongoose from "mongoose";
import { money } from "../utils/money.js";

const productSchema = new mongoose.Schema(
  {
    bearingNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    brand: { type: String, trim: true, default: "Generic" },
    // Free text, not an enum — categories are managed by admins via the Category collection.
    family: { type: String, trim: true, default: "" },
    description: { type: String, trim: true },
    weight: Number, // kg
    crossRefNumbers: [{ type: String, trim: true, uppercase: true }],

    hsnCode: { type: String, trim: true, default: "8482" }, // 8482 = ball/roller bearings under GST

    unit: { type: String, enum: ["piece", "box", "set"], default: "piece" },
    costPrice: { ...money, default: 0 },
    retailPrice: { ...money, default: 0 },
    wholesalePrice: { ...money, default: 0 },

    currentStock: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 5 },

    imageUrl: { type: String, trim: true },
  },
  { timestamps: true }
);

productSchema.index({ bearingNumber: "text", crossRefNumbers: "text" });

export default mongoose.model("Product", productSchema);
