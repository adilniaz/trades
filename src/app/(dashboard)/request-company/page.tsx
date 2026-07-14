"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { companyRequestSchema, type CompanyRequestInput } from "@/lib/validation/company-request";
import { requestCompany } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function RequestCompanyPage() {
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CompanyRequestInput>({
    resolver: zodResolver(companyRequestSchema),
    defaultValues: { name: "", ticker: "" },
  });

  const submit = async (data: CompanyRequestInput) => {
    setIsSubmitting(true);
    setStatus(null);
    try {
      const result = await requestCompany(data);
      if (result && typeof result === "object" && "error" in result) {
        setStatus({ type: "error", message: result.error as string });
      } else {
        setStatus({ type: "success", message: "Request submitted" });
        reset();
      }
  } catch {
    setStatus({ type: "error", message: "Something went wrong. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-lg font-semibold">Request a Company</h1>

      {status && (
        <div
          className={`rounded border px-4 py-3 text-sm ${
            status.type === "success"
              ? "border-green-300 bg-green-50 text-green-800"
              : "border-red-300 bg-red-50 text-red-800"
          }`}
        >
          {status.message}
        </div>
      )}

      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Company Name</Label>
          <Input id="name" {...register("name")} placeholder="e.g. Apple Inc." />
          {errors.name && (
            <p className="text-sm text-red-600">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ticker">Ticker</Label>
          <Input
            id="ticker"
            {...register("ticker")}
            placeholder="e.g. AAPL"
            style={{ textTransform: "uppercase" }}
          />
          {errors.ticker && (
            <p className="text-sm text-red-600">{errors.ticker.message}</p>
          )}
        </div>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Submitting…" : "Submit Request"}
        </Button>
      </form>
    </div>
  );
}
