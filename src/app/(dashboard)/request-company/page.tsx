import { Suspense } from 'react';
import { PageHeading } from '@/components/layout/page-heading';
import { RequestCompanyForm } from './request-company-form';

export default function RequestCompanyPage() {
  return (
    <div className="max-w-md space-y-6">
      <PageHeading description="Ask an admin to add a company to the tracker.">
        Request a company
      </PageHeading>
      <Suspense fallback={null}>
        <RequestCompanyForm />
      </Suspense>
    </div>
  );
}
