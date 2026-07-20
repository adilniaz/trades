'use client';

import { useRouter } from 'next/navigation';
import { CompanyForm } from '@/components/companies/company-form';
import { createCompany } from '@/app/(dashboard)/admin/companies/actions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeading } from '@/components/layout/page-heading';
import type { CompanyInput } from '@/lib/validation/company';

export default function NewCompanyPage() {
  const router = useRouter();

  const handleSubmit = async (data: CompanyInput) => {
    const fd = new FormData();
    fd.set('name', data.name);
    fd.set('ticker', data.ticker);
    if (data.isin) fd.set('isin', data.isin);
    fd.set('nonCompliantPct', String(data.nonCompliantPct));
    if (data.dividendPeriod) fd.set('dividendPeriod', data.dividendPeriod);
    if (data.nextDividendDate)
      fd.set('nextDividendDate', data.nextDividendDate.toISOString());

    const result = await createCompany(fd);
    if (result?.error) return result;
    router.push('/admin/companies');
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
        Add company
      </PageHeading>
      <Card>
        <CardHeader>
          <CardTitle>New company</CardTitle>
        </CardHeader>
        <CardContent>
          <CompanyForm onSubmit={handleSubmit} submitLabel="Create company" />
        </CardContent>
      </Card>
    </div>
  );
}
