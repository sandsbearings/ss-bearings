import mongoose from "mongoose";

const invoiceItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    bearingNumber: String,
    brand: String,
    hsnCode: String,
    quantity: { type: Number, required: true },
    unit: String,
    unitPrice: { type: Number, required: true },
    gstRate: { type: Number, required: true },
    taxAmount: { type: Number, required: true },
    lineTotal: { type: Number, required: true }, // qty * unitPrice + taxAmount
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true, unique: true },
    party: { type: mongoose.Schema.Types.ObjectId, ref: "Party" }, // null = walk-in customer
    items: [invoiceItemSchema],

    isInterState: { type: Boolean, default: false }, // true => IGST, false => CGST+SGST

    subtotal: { type: Number, required: true }, // pre-discount

    discountType: { type: String, enum: ["flat", "percent"] }, // absent = no discount
    discountValue: { type: Number, default: 0 }, // raw amount the cashier entered (₹ or %)
    discountAmount: { type: Number, default: 0 }, // actual ₹ reduction applied to the subtotal

    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    totalTax: { type: Number, required: true },
    grandTotal: { type: Number, required: true },

    paymentMode: { type: String, enum: ["cash", "upi", "card", "credit"], default: "cash" },
    paymentStatus: { type: String, enum: ["paid", "partial", "credit"], default: "paid" },
    amountPaid: { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    status: { type: String, enum: ["active", "voided"], default: "active" },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.model("Invoice", invoiceSchema);
