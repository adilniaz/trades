import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { EditCompanyForm } from "./edit-form";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditCompanyPage({ params }: Props) {
  await requireAuth({ roles: ["ADMIN"] });
  const { id } = await params;

  const company = await prisma.company.findUnique({
    where: { id },
  });

  if (!company || company.deletedAt) notFound();

  const initial = {
    name: company.name,
    ticker: company.ticker,
    isin: company.isin ?? undefined,
    nonCompliantPct: Number(company.nonCompliantPct),
    dividendPeriod: company.dividendPeriod ?? undefined,
    nextDividendDate: company.nextDividendDate
      ? new Date(company.nextDividendDate)
      : undefined,
  };

  return (
    <EditCompanyForm
      companyId={company.id}
      initial={initial}
      nextDividendDateStr={
        company.nextDividendDate
          ? company.nextDividendDate.toISOString().slice(0, 10)
          : undefined
      }
    />
  );
}
