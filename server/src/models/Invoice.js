import mongoose from "mongoose";
import { money } from "../utils/money.js";

const invoiceItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    bearingNumber: String,
    brand: String,
    hsnCode: String,
    quantity: { type: Number, required: true },
    unit: String,
    unitPrice: { ...money, required: true },
    gstRate: { type: Number, required: true },
    taxAmount: { ...money, required: true },
    lineTotal: { ...money, required: true }, // qty * unitPrice + taxAmount
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true, unique: true },
    party: { type: mongoose.Schema.Types.ObjectId, ref: "Party" }, // null = walk-in customer
    // The customer's details as they were when the bill was made (or last edited), so a later
    // change to the customer (e.g. adding a GSTIN) doesn't alter old bills, their PDF, or which
    // GST section (B2B/B2C) they fall in. Older bills without it fall back to the customer record.
    billedTo: {
      name: String,
      phone: String,
      gstin: String,
      pan: String,
      address: String,
    },
    items: [invoiceItemSchema],

    isInterState: { type: Boolean, default: false }, // true => IGST, false => CGST+SGST

    subtotal: { ...money, required: true }, // pre-discount

    discountType: { type: String, enum: ["flat", "percent"] }, // absent = no discount
    discountValue: { type: Number, default: 0 }, // raw amount the cashier entered (₹ or %)
    discountAmount: { ...money, default: 0 }, // actual ₹ reduction applied to the subtotal

    cgst: { ...money, default: 0 },
    sgst: { ...money, default: 0 },
    igst: { ...money, default: 0 },
    totalTax: { ...money, required: true },
    grandTotal: { ...money, required: true },

    paymentMode: { type: String, enum: ["cash", "upi", "card", "credit"], default: "cash" },
    paymentStatus: { type: String, enum: ["paid", "partial", "credit"], default: "paid" },
    amountPaid: { ...money, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    status: { type: String, enum: ["active", "voided"], default: "active" },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.model("Invoice", invoiceSchema);
