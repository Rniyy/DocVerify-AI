import { Router } from "express";
import { login, register } from "../controllers/auth.controller";
import { rateLimit } from "../middleware/rateLimit";
import { asyncHandler } from "../utils/asyncHandler";

export const authRouter = Router();

// Stage 18: slow down brute-force attempts — 10 tries per 15 minutes per IP.
const authLimiter = rateLimit({
  max: 10,
  windowMs: 15 * 60 * 1000,
  message: "Too many attempts. Please wait a few minutes and try again.",
});

authRouter.post("/register", authLimiter, asyncHandler(register));
authRouter.post("/login", authLimiter, asyncHandler(login));
