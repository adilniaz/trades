import type { Txn } from "@/lib/calculations";

export function toTxn(t: {
  type: string;
  date: Date;
  shares: unknown;
  pricePerShare: unknown;
  amount: unknown;
  purifiedAt: Date | null;
}): Txn {
  return {
    type: t.type as Txn["type"],
    date: t.date,
    shares: t.shares === null ? null : Number(t.shares),
    pricePerShare: t.pricePerShare === null ? null : Number(t.pricePerShare),
    amount: t.amount === null ? null : Number(t.amount),
    purifiedAt: t.purifiedAt,
  };
}
