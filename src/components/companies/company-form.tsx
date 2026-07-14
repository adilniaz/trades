"use client";

import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { companySchema, type CompanyInput } from "@/lib/validation/company";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/** Field values as they live in the form state (before zod validation).
 * Derived manually because companySchema uses z.preprocess which makes
 * z.input<typeof companySchema> too wide (unknown); the form uses typed
 * inputs (number, date string), so this manual type is intentionally narrower. */
type FormValues = {
  name: string;
  ticker: string;
  nonCompliantPct: number;
  dividendPeriod: string;
  nextDividendDate: string;
};

type Props = {
  initial?: Partial<{
    name: string;
    ticker: string;
    nonCompliantPct: number;
    dividendPeriod: string;
    /** Pass a YYYY-MM-DD string for <input type="date">. Dates are also accepted. */
    nextDividendDate: Date | string;
  }>;
  onSubmit: (data: CompanyInput) => Promise<{ error?: unknown } | void>;
  submitLabel?: string;
  disabled?: boolean;
  disabledFields?: ("name" | "ticker")[];
};

function toDateStr(v: Date | string): string {
  if (typeof v === "string") return v;
  return v.toISOString().slice(0, 10);
}

export function CompanyForm({
  initial,
  onSubmit,
  submitLabel = "Save",
  disabled,
  disabledFields,
}: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({
    // companySchema's z.preprocess on nonCompliantPct/nextDividendDate takes
    // an untyped input, which collapses zodResolver's inferred input type to
    // `unknown` — narrower than a blanket `any`, but still an assertion that
    // FormValues matches what companySchema.safeParse actually accepts.
    resolver: zodResolver(companySchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      name: initial?.name ?? "",
      ticker: initial?.ticker ?? "",
      nonCompliantPct: initial?.nonCompliantPct ?? 0,
      dividendPeriod: initial?.dividendPeriod ?? "",
      nextDividendDate: initial?.nextDividendDate
        ? toDateStr(initial.nextDividendDate)
        : "",
    },
  });

  const submit = async (data: FormValues) => {
    // zodResolver already validated; the output matches CompanyInput
    const result = await onSubmit(data as unknown as CompanyInput);
    if (result && "error" in result && typeof result.error === "object" && result.error !== null) {
      const fieldErrors = result.error as Record<string, string[]>;
      for (const [field, messages] of Object.entries(fieldErrors)) {
        if (messages.length > 0) {
          setError(field as keyof FormValues, { message: messages[0] });
        }
      }
      return;
    }
    if (result && "error" in result && typeof result.error === "string") {
      setError("root", { message: result.error });
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name")} disabled={disabledFields?.includes("name")} />
        {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ticker">Ticker</Label>
        <Input
          id="ticker"
          {...register("ticker")}
          disabled={disabledFields?.includes("ticker")}
          onChange={(e) => {
            e.target.value = e.target.value.toUpperCase();
          }}
        />
        {errors.ticker && <p className="text-sm text-red-600">{errors.ticker.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="nonCompliantPct">Non-compliant % (0-100)</Label>
        <Input
          id="nonCompliantPct"
          type="number"
          step="0.01"
          {...register("nonCompliantPct", { valueAsNumber: true })}
        />
        {errors.nonCompliantPct && (
          <p className="text-sm text-red-600">{errors.nonCompliantPct.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="dividendPeriod">Dividend period</Label>
        <Input id="dividendPeriod" {...register("dividendPeriod")} />
        {errors.dividendPeriod && (
          <p className="text-sm text-red-600">{errors.dividendPeriod.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="nextDividendDate">Next dividend date</Label>
        <Input id="nextDividendDate" type="date" {...register("nextDividendDate")} />
        {errors.nextDividendDate && (
          <p className="text-sm text-red-600">{errors.nextDividendDate.message}</p>
        )}
      </div>

      {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}

      <Button type="submit" disabled={disabled || isSubmitting}>
        {isSubmitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
