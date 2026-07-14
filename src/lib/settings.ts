// CAUTION: Module-level cache. In a multi-instance deployment, changes made on
// one instance will not invalidate the cache on other instances until the TTL
// expires (max 60s staleness). This is acceptable for the settings use case.

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

export async function setTransactionFee(fee: number): Promise<void> {
  await prisma.setting.upsert({
    where: { key: "transactionFee" },
    update: { value: String(fee) },
    create: { key: "transactionFee", value: String(fee) },
  });

  // Invalidate the cache so the next read picks up the new value.
  cache = null;
}
