import express from "express";
import cors from "cors";
import morgan from "morgan";

import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import partyRoutes from "./routes/partyRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import purchaseRoutes from "./routes/purchaseRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import brandRoutes from "./routes/brandRoutes.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

const app = express();

const allowedOrigins = [process.env.CLIENT_ORIGIN].filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : "*" }));
app.use(express.json());
app.use(morgan("dev"));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/parties", partyRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/users", userRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/brands", brandRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
