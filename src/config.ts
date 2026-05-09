import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: required("JWT_SECRET"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  webhookSecret: process.env.WEBHOOK_SECRET ?? "dev_webhook_secret",
};

export { config };
