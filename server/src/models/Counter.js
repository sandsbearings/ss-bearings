import mongoose from "mongoose";

// Generic sequence generator used for human-readable invoice/purchase numbers.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. "invoice", "purchase"
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model("Counter", counterSchema);

export async function nextSequence(name) {
  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}
