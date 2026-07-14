import { z } from "zod";

export const transactionSchema = z
  .object({
    type: z.enum(["BUY", "SELL", "DIVIDEND"]),
    date: z.coerce.date().refine(
      (d) => !isNaN(d.getTime()),
      "Invalid date"
    ),
    shares: z.coerce.number().positive().optional(),
    pricePerShare: z.coerce.number().positive().optional(),
    amount: z.coerce.number().positive().optional(),
  })
  .refine(
    (data) =>
      data.type === "DIVIDEND"
        ? data.amount !== undefined
        : data.shares !== undefined && data.pricePerShare !== undefined,
    { message: "Buy/Sell need shares and price; Dividend needs an amount" }
  );

export type TransactionInput = z.infer<typeof transactionSchema>;

// Form-level schema using raw strings (not coerced numbers/date). Used by
// the client-side TransactionForm with react-hook-form, where number inputs
// need to handle empty-state ("") differently than the server's coerce
// semantics. The server always re-validates via transactionSchema above.
export const transactionFormSchema = z.object({
  type: z.enum(["BUY", "SELL", "DIVIDEND"]),
  date: z.string().min(1, "Date is required"),
  shares: z.string().optional(),
  pricePerShare: z.string().optional(),
  amount: z.string().optional(),
});

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;
