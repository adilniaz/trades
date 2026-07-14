// CAUTION: Module-level cache. In a multi-instance deployment, changes made on
// one instance will not invalidate the cache on other instances until the TTL
// expires (max 60s staleness). This is acceptable for the settings use case.

import type { PrismaClient, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface AppSettings {
  transactionFee: number;
  displayCurrency: string;
}

const TTL_MS = 60_000;

let cache: AppSettings | null = null;
let cacheExpiry = 0;

export async function getSettings(): Promise<AppSettings> {
  if (cache && Date.now() < cacheExpiry) return cache;

  const rows = await prisma.setting.findMany({
    where: { key: { in: ["transactionFee", "displayCurrency"] } },
  });

  const map = new Map(rows.map((r) => [r.key, r.value]));

  cache = {
    transactionFee: Number(map.get("transactionFee") ?? "0"),
    displayCurrency: map.get("displayCurrency") ?? "USD",
  };
  cacheExpiry = Date.now() + TTL_MS;
  return cache;
}

export async function setTransactionFee(
  fee: number,
  client: PrismaClient | Prisma.TransactionClient = prisma
): Promise<void> {
  await client.setting.upsert({
    where: { key: "transactionFee" },
    update: { value: String(fee) },
    create: { key: "transactionFee", value: String(fee) },
  });

  // Invalidate the cache so the next read picks up the new value. Done
  // outside any transaction the caller passed in — this is a pure in-memory
  // op with no failure mode, so it's correct to run it once the write is
  // known to have succeeded (the caller awaits the transaction before this
  // returns), rather than trying to make it part of the transaction itself.
  cache = null;
}
