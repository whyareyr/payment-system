import { HttpError } from "../middleware/error.js";
import { prisma } from "../prisma.js";
import { userWalletCode } from "./account.service.js";

export async function getUserWalletBalance(userId: string) {
  const account = await prisma.account.findUnique({
    where: {
      code: userWalletCode(userId),
    },
    include: {
      entries: true,
    },
  });

  if (!account) {
    throw new HttpError(404, "Wallet account not found");
  }

  let balance = 0;

  for (const entry of account.entries) {
    if (entry.direction === "CREDIT") {
      balance += entry.amount;
    } else {
      balance -= entry.amount;
    }
  }

  return {
    accountId: account.id,
    currency: account.entries[0]?.currency ?? "INR",
    balance,
  };
}

export async function getUserLedgerEntries(userId: string) {
  const account = await prisma.account.findUnique({
    where: {
      code: userWalletCode(userId),
    },
  });

  if (!account) {
    throw new HttpError(404, "Wallet account not found");
  }

  return prisma.ledgerEntry.findMany({
    where: {
      accountId: account.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      ledgerTransaction: true,
    },
  });
}
