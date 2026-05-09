import { Prisma } from "@prisma/client/extension";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { paymentQueue } from "../queues/payment.queue.js";
import { HttpError } from "../middleware/error.js";
import { sha256 } from "../utils/crypto.js";
import {
  SYSTEM_PROCESSING_CLEARING,
  userWalletCode,
} from "./account.service.js";

export const createPaymentSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().length(3).default("INR"),
});
