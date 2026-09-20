import express from "express";
import { listUsers, createUser, updateUser, deleteUser } from "../controllers/userController.js";
import { protect, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(protect, requireRole("admin"));
router.get("/", listUsers);
router.post("/", createUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

export default router;
