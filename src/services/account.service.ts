import type { Prisma, PrismaClient } from "@prisma/client/extension";
import { prisma } from "../prisma.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const SYSTEM_PROCESSING_CLEARING = "SYSTEM:PROCESSOR_CLEARING";

export function userWalletCode(userId: string) {
  return `USER_WALLET:${userId}`;
}

export async function ensureSystemAccounts(db: DbClient = prisma) {
  await db.account.upsert({
    where: { code: SYSTEM_PROCESSING_CLEARING },
    update: {},
    create: {
      code: SYSTEM_PROCESSING_CLEARING,
      name: "Processor clearing account",
      type: "ASSET",
    },
  });
}

export async function createUserWalletAccount(db: DbClient, userId: string) {
  return db.account.create({
    data: {
      code: userWalletCode(userId),
      name: "User wallet",
      type: "LIABILITY",
      userId,
    },
  });
}

//account.service.ts, auth.service.ts
