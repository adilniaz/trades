import { z } from "zod";

export const companyRequestSchema = z.object({
  name: z.string().min(1, "Name is required"),
  ticker: z.string().min(1, "Ticker is required").toUpperCase(),
  isin: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v : undefined)),
});

export type CompanyRequestInput = z.infer<typeof companyRequestSchema>;
