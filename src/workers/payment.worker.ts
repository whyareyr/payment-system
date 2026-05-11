import crypto from "crypto";
import { Worker } from "bullmq";
import { prisma } from "../prisma.js";
import { redisConnection } from "../queues/payment.queue.js";
import {
  markPaymentProcessing,
  finalizePaymentSucceeded,
  markPaymentFailed,
} from "../services/payment.service.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fakeExternalCharge(paymentId: string) {
  await sleep(800);

  /**
   * Simulate payment provider instability.
   * Around 25% of attempts fail.
   */
  const shouldFail = Math.random() < 0.25;

  if (shouldFail) {
    throw new Error("Fake processor temporary failure");
  }

  return {
    externalRef: `fake_charge_${paymentId}_${crypto.randomUUID()}`,
  };
}

const worker = new Worker(
  "payment-processing",
  async (job) => {
    const { paymentId } = job.data as { paymentId: string };

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new Error(`Payment not found: ${paymentId}`);
    }

    if (payment.status === "SUCCEEDED") {
      return {
        skipped: true,
        reason: "Already succeeded",
      };
    }

    await markPaymentProcessing(paymentId);

    const result = await fakeExternalCharge(paymentId);

    await finalizePaymentSucceeded(paymentId, result.externalRef);

    return {
      paymentId,
      status: "SUCCEEDED",
    };
  },
  {
    connection: redisConnection,
  }
);

worker.on("completed", (job) => {
  console.log(`Payment job completed: ${job.id}`);
});

worker.on("failed", async (job, err) => {
  console.error(`Payment job failed: ${job?.id}`, err.message);

  if (!job) {
    return;
  }

  const paymentId = (job.data as { paymentId: string }).paymentId;
  const maxAttempts = job.opts.attempts ?? 1;

  if (job.attemptsMade >= maxAttempts) {
    await markPaymentFailed(paymentId, err.message);
    console.error(`Payment marked FAILED after retries: ${paymentId}`);
  }
});
