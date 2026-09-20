import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true }, // shown on the public catalog only
    imageUrl: { type: String, trim: true }, // shown on the public catalog only
  },
  { timestamps: true }
);

export default mongoose.model("Category", categorySchema);
