import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  login,
  loginSchema,
  signup,
  signupSchema,
} from "../services/auth.service.js";

export const authRoutes = Router();

authRoutes.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const input = signupSchema.parse(req.body);
    const result = await signup(input);
    res.status(201).json(result);
  })
);

authRoutes.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const result = await login(input);
    res.json(result);
  })
);
