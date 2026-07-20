import { z } from "zod";

export const companySchema = z.object({
  name: z.string().min(1, "Name is required"),
  ticker: z.string().min(1, "Ticker is required").toUpperCase(),
  isin: z.string().optional(),
  nonCompliantPct: z.preprocess(
    (v) => (v === "" || v === undefined ? 0 : Number(v)),
    z.coerce
      .number()
      .min(0, "Must be 0-100")
      .max(100, "Must be 0-100")
      .refine(
        (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9,
        "Must have at most 2 decimal places"
      )
  ),
  dividendPeriod: z.string().optional(),
  nextDividendDate: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : new Date(v as string)),
    z.date().optional()
  ),
});

export type CompanyInput = z.infer<typeof companySchema>;
