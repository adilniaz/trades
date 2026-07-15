'use client';

import { useRouter } from 'next/navigation';
import { CompanyForm } from '@/components/companies/company-form';
import { updateCompany } from '@/app/(dashboard)/admin/companies/actions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeading } from '@/components/layout/page-heading';
import type { CompanyInput } from '@/lib/validation/company';

type Props = {
  companyId: string;
  initial: {
    name: string;
    ticker: string;
    nonCompliantPct: number;
    dividendPeriod?: string;
    nextDividendDate?: Date;
  };
  nextDividendDateStr?: string;
};

export function EditCompanyForm({
  companyId,
  initial,
  nextDividendDateStr,
}: Props) {
  const router = useRouter();

  const handleSubmit = async (data: CompanyInput) => {
    const fd = new FormData();
    fd.set('name', data.name);
    fd.set('ticker', data.ticker);
    fd.set('nonCompliantPct', String(data.nonCompliantPct));
    if (data.dividendPeriod) fd.set('dividendPeriod', data.dividendPeriod);
    if (data.nextDividendDate)
      fd.set('nextDividendDate', data.nextDividendDate.toISOString());

    const result = await updateCompany(companyId, fd);
    if (result?.error) return result;
    router.push('/admin/companies');
  };

  // Pass the YYYY-MM-DD string to the form so <input type="date"> renders correctly
  const formInitial = {
    name: initial.name,
    ticker: initial.ticker,
    nonCompliantPct: initial.nonCompliantPct,
    dividendPeriod: initial.dividendPeriod,
    nextDividendDate:
      nextDividendDateStr ??
      initial.nextDividendDate?.toISOString().slice(0, 10),
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeading
        actions={
          <Button
            variant="outline"
            onClick={() => router.push('/admin/companies')}
          >
            Back
          </Button>
        }
      >
        Edit company
      </PageHeading>
      <Card>
        <CardHeader>
          <CardTitle>{initial.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <CompanyForm
            initial={formInitial}
            onSubmit={handleSubmit}
            submitLabel="Save changes"
          />
        </CardContent>
      </Card>
    </div>
  );
}
