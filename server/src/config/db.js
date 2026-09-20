import mongoose from "mongoose";

export async function connectDB() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
}
