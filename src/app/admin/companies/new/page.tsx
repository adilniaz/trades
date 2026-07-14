"use client";

import { useRouter } from "next/navigation";
import { CompanyForm } from "@/components/companies/company-form";
import { createCompany } from "@/app/admin/companies/actions";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CompanyInput } from "@/lib/validation/company";

export default function NewCompanyPage() {
  const router = useRouter();

  const handleSubmit = async (data: CompanyInput) => {
    const fd = new FormData();
    fd.set("name", data.name);
    fd.set("ticker", data.ticker);
    fd.set("nonCompliantPct", String(data.nonCompliantPct));
    if (data.dividendPeriod) fd.set("dividendPeriod", data.dividendPeriod);
    if (data.nextDividendDate) fd.set("nextDividendDate", data.nextDividendDate.toISOString());

    const result = await createCompany(fd);
    if (result?.error) return result;
    router.push("/admin/companies");
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Add Company</h1>
        <Button variant="outline" onClick={() => router.push("/admin/companies")}>
          Back
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>New Company</CardTitle>
        </CardHeader>
        <CardContent>
          <CompanyForm onSubmit={handleSubmit} submitLabel="Create Company" />
        </CardContent>
      </Card>
    </div>
  );
}
