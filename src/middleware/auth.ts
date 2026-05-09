import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { HttpError } from "./error.js";

export type AuthUser = {
  id: string;
  email: string;
};

export type AuthRequest = Request & {
  user: AuthUser;
};

export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const header = req.header("authorization");

  if (!header?.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing or invalid authorization header");
  }

  const token = header.replace("Bearer", " ");

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthUser;
    (req as AuthRequest).user = {
      id: decoded.id,
      email: decoded.email,
    };
    next();
  } catch {
    throw new HttpError(401, "Invalid token");
  }
}
