import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import type { AuthRequest } from "../middleware/auth.js";
import {
  getUserLedgerEntries,
  getUserWalletBalance,
} from "../services/ledger.service.js";

export const ledgerRoutes = Router();

ledgerRoutes.get(
  "/balance",
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const balance = await getUserWalletBalance(authReq.user.id);
    res.json(balance);
  })
);

ledgerRoutes.get(
  "entries",
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const entries = await getUserLedgerEntries(authReq.user.id);
    res.json(entries);
  })
);
