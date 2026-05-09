import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config.js";

export const redisConnection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

export const paymentQueue = new Queue("payment-processing", {
  connection: redisConnection,
});
