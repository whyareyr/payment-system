import { z } from "zod";
import { prisma } from "../prisma.js";
import { paymentQueue } from "../queues/payment.queue.js";
import { HttpError } from "../middleware/error.js";
import { sha256 } from "../utils/crypto.js";
import {
  SYSTEM_PROCESSOR_CLEARING,
  userWalletCode,
} from "./account.service.js";
import { Prisma } from "@prisma/client/extension";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

export const createPaymentSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().length(3).default("INR"),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

function isUniqueConstraintError(err: unknown) {
  return err instanceof PrismaClientKnownRequestError && err.code === "P2002";
}

async function findCachedIdempotencyResult(args: {
  userId: string;
  key: string;
  method: string;
  path: string;
}) {
  return prisma.idempotencyKey.findUnique({
    where: {
      userId_key_method_path: {
        userId: args.userId,
        key: args.key,
        method: args.method,
        path: args.path,
      },
    },
  });
}

export async function createPayment(args: {
  userId: string;
  input: CreatePaymentInput;
  idempotencyKey: string;
  method: string;
  path: string;
}) {
  const requestHash = sha256({
    userId: args.userId,
    method: args.method,
    path: args.path,
    body: args.input,
  });

  const cached = await findCachedIdempotencyResult({
    userId: args.userId,
    key: args.idempotencyKey,
    method: args.method,
    path: args.path,
  });

  if (cached) {
    if (cached.requestHash !== requestHash) {
      throw new HttpError(
        409,
        "This Idempotency-Key was already used with a different request body"
      );
    }

    return {
      statusCode: cached.statusCode,
      body: cached.responseJson,
    };
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const payment = await tx.payment.create({
        data: {
          userId: args.userId,
          amount: args.input.amount,
          currency: args.input.currency,
          status: "INITIATED",
        },
      });

      const responseBody = {
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
      };

      await tx.idempotencyKey.create({
        data: {
          userId: args.userId,
          key: args.idempotencyKey,
          method: args.method,
          path: args.path,
          requestHash,
          responseJson: responseBody,
          statusCode: 202,
          paymentId: payment.id,
        },
      });

      return {
        statusCode: 202,
        body: responseBody,
      };
    });

    await paymentQueue.add(
      "process-payment",
      {
        paymentId: result.body.paymentId,
      },
      {
        jobId: result.body.paymentId,
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    return result;
  } catch (err) {
    /**
     * Handles race condition:
     *
     * Request A and Request B arrive at the same time with same idempotency key.
     * Both see no cached record.
     * A inserts first.
     * B hits unique constraint.
     * B should return A's result.
     */
    if (isUniqueConstraintError(err)) {
      const raceWinner = await findCachedIdempotencyResult({
        userId: args.userId,
        key: args.idempotencyKey,
        method: args.method,
        path: args.path,
      });

      if (raceWinner && raceWinner.requestHash === requestHash) {
        return {
          statusCode: raceWinner.statusCode,
          body: raceWinner.responseJson,
        };
      }
    }

    throw err;
  }
}

export async function getPaymentForUser(userId: string, paymentId: string) {
  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId,
      userId,
    },
  });

  if (!payment) {
    throw new HttpError(404, "Payment not found");
  }

  return payment;
}

export async function finalizePaymentSucceeded(
  paymentId: string,
  externalRef: string
) {
  return prisma.$transaction(async (tx: any) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new HttpError(404, "Payment not found");
    }

    if (payment.status === "SUCCEEDED") {
      return payment;
    }

    const processorAccount = await tx.account.findUnique({
      where: {
        code: SYSTEM_PROCESSOR_CLEARING,
      },
    });

    const userWalletAccount = await tx.account.findUnique({
      where: {
        code: userWalletCode(payment.userId),
      },
    });

    if (!processorAccount || !userWalletAccount) {
      throw new Error("Required ledger accounts are missing");
    }

    const updatedPayment = await tx.payment.update({
      where: {
        id: paymentId,
      },
      data: {
        status: "SUCCEEDED",
        externalRef,
        failureReason: null,
      },
    });

    await tx.ledgerTransaction.create({
      data: {
        paymentId,
        description: `Payment ${paymentId} succeeded`,
        entries: {
          create: [
            {
              accountId: processorAccount.id,
              direction: "DEBIT",
              amount: payment.amount,
              currency: payment.currency,
            },
            {
              accountId: userWalletAccount.id,
              direction: "CREDIT",
              amount: payment.amount,
              currency: payment.currency,
            },
          ],
        },
      },
    });

    return updatedPayment;
  });
}

export async function markPaymentProcessing(paymentId: string) {
  await prisma.payment.updateMany({
    where: {
      id: paymentId,
      status: {
        in: ["INITIATED", "PROCESSING"],
      },
    },
    data: {
      status: "PROCESSING",
    },
  });
}

export async function markPaymentFailed(paymentId: string, reason: string) {
  await prisma.payment.updateMany({
    where: {
      id: paymentId,
      status: {
        not: "SUCCEEDED",
      },
    },
    data: {
      status: "FAILED",
      failureReason: reason,
    },
  });
}
