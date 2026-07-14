"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  addTransaction,
  updateTransaction,
} from "@/app/(dashboard)/companies/[id]/actions";
import type { TransactionInput } from "@/lib/validation/transaction";
import {
  transactionFormSchema,
  type TransactionFormValues,
} from "@/lib/validation/transaction";

// ---------------------------------------------------------------------------
// Prisma-sourced transaction shape (for display/edit)
// ---------------------------------------------------------------------------

export type Transaction = {
  id: string;
  type: string;
  date: Date | string;
  shares: number | null;
  pricePerShare: number | null;
  amount: number | null;
  purifiedAt: Date | string | null;
};

type Props = {
  companyId: string;
  editing?: Transaction | null;
  onDone?: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateStr(v: Date | string): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") {
    // If already YYYY-MM-DD, return as-is; otherwise try to parse
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    return new Date(v).toISOString().slice(0, 10);
  }
  return "";
}

function toNum(v: string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

function toInput(data: TransactionFormValues): TransactionInput {
  return {
    type: data.type as "BUY" | "SELL" | "DIVIDEND",
    date: data.date ? new Date(data.date) : new Date(),
    shares: toNum(data.shares),
    pricePerShare: toNum(data.pricePerShare),
    amount: toNum(data.amount),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransactionForm({ companyId, editing, onDone }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!editing;

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<TransactionFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(transactionFormSchema) as any,
    defaultValues: {
      type: (editing?.type as "BUY" | "SELL" | "DIVIDEND" | undefined) ?? "BUY",
      date: editing?.date ? toDateStr(editing.date) : "",
      shares: editing?.shares !== null && editing?.shares !== undefined ? String(editing.shares) : "",
      pricePerShare: editing?.pricePerShare !== null && editing?.pricePerShare !== undefined ? String(editing.pricePerShare) : "",
      amount: editing?.amount !== null && editing?.amount !== undefined ? String(editing.amount) : "",
    },
  });

  const selectedType = watch("type");

  const submit = async (data: TransactionFormValues) => {
    setIsSubmitting(true);
    try {
      const input = toInput(data);

      // Client-side cross-field validation (mirrors server refine)
      if (data.type === "DIVIDEND") {
        if (!data.amount || data.amount === "" || Number(data.amount) <= 0) {
          setError("amount", { message: "Amount must be greater than 0" });
          setIsSubmitting(false);
          return;
        }
      } else {
        if (!data.shares || data.shares === "" || Number(data.shares) <= 0) {
          setError("shares", { message: "Shares must be greater than 0" });
          setIsSubmitting(false);
          return;
        }
        if (!data.pricePerShare || data.pricePerShare === "" || Number(data.pricePerShare) <= 0) {
          setError("pricePerShare", { message: "Price must be greater than 0" });
          setIsSubmitting(false);
          return;
        }
      }

      let result: { error?: unknown; success?: boolean };
      if (isEditMode) {
        result = await updateTransaction(editing!.id, companyId, input);
      } else {
        result = await addTransaction(companyId, input);
      }

      if (result.error) {
        if (typeof result.error === "object" && result.error !== null) {
          // Field-level errors from server validation
          const fieldErrors = result.error as Record<string, string[]>;
          for (const [field, messages] of Object.entries(fieldErrors)) {
            if (messages.length > 0) {
              setError(field as keyof TransactionFormValues, { message: messages[0] });
            }
          }
        } else if (typeof result.error === "string") {
          setError("root", { message: result.error });
        }
        return;
      }

      if (isEditMode) {
        onDone?.();
      } else {
        reset();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const showSharesFields = selectedType === "BUY" || selectedType === "SELL";
  const showAmountField = selectedType === "DIVIDEND";

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="type">Type</Label>
        <select
          id="type"
          {...register("type")}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
          <option value="DIVIDEND">DIVIDEND</option>
        </select>
        {errors.type && (
          <p className="text-sm text-red-600">{errors.type.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="date">Date</Label>
        <Input id="date" type="date" {...register("date")} />
        {errors.date && (
          <p className="text-sm text-red-600">{errors.date.message}</p>
        )}
      </div>

      {showSharesFields && (
        <>
          <div className="space-y-2">
            <Label htmlFor="shares">Shares</Label>
            <Input
              id="shares"
              type="number"
              step="any"
              {...register("shares")}
            />
            {errors.shares && (
              <p className="text-sm text-red-600">{errors.shares.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pricePerShare">Price / Share</Label>
            <Input
              id="pricePerShare"
              type="number"
              step="any"
              {...register("pricePerShare")}
            />
            {errors.pricePerShare && (
              <p className="text-sm text-red-600">
                {errors.pricePerShare.message}
              </p>
            )}
          </div>
        </>
      )}

      {showAmountField && (
        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            type="number"
            step="any"
            {...register("amount")}
          />
          {errors.amount && (
            <p className="text-sm text-red-600">{errors.amount.message}</p>
          )}
        </div>
      )}

      {errors.root && (
        <p className="text-sm text-red-600">{errors.root.message}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Saving…"
            : isEditMode
              ? "Update"
              : "Add Transaction"}
        </Button>
        {isEditMode && (
          <Button
            type="button"
            variant="outline"
            onClick={() => onDone?.()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
