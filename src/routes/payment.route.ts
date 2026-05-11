import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import type { AuthRequest } from "../middleware/auth.js";
import {
  createPayment,
  createPaymentSchema,
  getPaymentForUser,
} from "../services/payment.service.js";
import { HttpError } from "../middleware/error.js";

export const paymentRoutes = Router();

paymentRoutes.post(
  "/",
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;

    const idempotencyKey = req.header("Idempotency-Key");

    if (!idempotencyKey) {
      throw new HttpError(400, "Missing Idempotency-Key header");
    }

    const input = createPaymentSchema.parse(req.body);

    const result = await createPayment({
      userId: authReq.user.id,
      input,
      idempotencyKey,
      method: "POST",
      path: "/payments",
    });

    res.status(result.statusCode).json(result.body);
  })
);

paymentRoutes.get(
  "/:paymentId",
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;

    const payment = await getPaymentForUser(
      authReq.user.id,
      req.params.paymentId as string // Express defaults req.params to 'string | undefined', but our service strictly requires a string.
      // We assert it as a string here since Express guarantees route params are strings.
    );

    res.json(payment);
  })
);
