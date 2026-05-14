import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { createWebhookSignature, safeCompare } from "../utils/crypto.js";
import {
  finalizePaymentSucceeded,
  markPaymentFailed,
} from "./payment.service.js";
import { HttpError } from "../middleware/error.js";

type FakeWebhookEvent = {
  id: string;
  type: "payment.succeeded" | "payment.failed";
  data: {
    paymentId: string;
    externalRef?: string;
    reason?: string;
  };
};

export async function handleFakeProcessorWebhook(args: {
  rawBody: Buffer;
  signature: string | undefined;
}) {
  if (!args.signature) {
    throw new HttpError(400, "Missing webhook signature");
  }

  const expectedSignature = createWebhookSignature(
    args.rawBody,
    config.webhookSecret
  );

  if (!safeCompare(args.signature, expectedSignature)) {
    throw new HttpError(401, "Invalid webhook signature");
  }

  const event = JSON.parse(args.rawBody.toString("utf8")) as FakeWebhookEvent;

  const storedEvent = await prisma.webhookEvent.upsert({
    where: {
      eventId: event.id,
    },
    update: {},
    create: {
      eventId: event.id,
      type: event.type,
      payload: event,
      paymentId: event.data.paymentId,
    },
  });

  if (storedEvent.processedAt) {
    return {
      received: true,
      duplicate: true,
    };
  }

  if (event.type === "payment.succeeded") {
    await finalizePaymentSucceeded(
      event.data.paymentId,
      event.data.externalRef ?? `webhook_${event.id}`
    );
  }

  if (event.type === "payment.failed") {
    await markPaymentFailed(
      event.data.paymentId,
      event.data.reason ?? "Payment failed via webhook"
    );
  }

  await prisma.webhookEvent.update({
    where: {
      eventId: event.id,
    },
    data: {
      processedAt: new Date(),
    },
  });

  return {
    received: true,
  };
}
