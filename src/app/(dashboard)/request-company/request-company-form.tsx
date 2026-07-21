'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  companyRequestSchema,
  type CompanyRequestInput,
} from '@/lib/validation/company-request';
import { requestCompany } from './actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Field values as they live in the form state (before zod validation).
 * Derived manually because companyRequestSchema's `isin` transform collapses
 * the optional key into a required-but-possibly-undefined output type —
 * narrower than the form's actual (pre-transform) input shape. Same pattern
 * as CompanyForm's FormValues in components/companies/company-form.tsx. */
type FormValues = {
  name: string;
  ticker: string;
  isin: string;
};

export function RequestCompanyForm() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    // companyRequestSchema's `isin` transform takes an optional string and
    // makes the output type's `isin` key required-but-possibly-undefined,
    // which is narrower than the form's actual (pre-transform) input shape.
    // Cast is an assertion that FormValues matches what
    // companyRequestSchema.safeParse actually accepts, same pattern as
    // CompanyForm.
    resolver: zodResolver(companyRequestSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      name: searchParams.get('name') ?? '',
      ticker: '',
      isin: searchParams.get('isin') ?? '',
    },
  });

  const submit = async (data: FormValues) => {
    setIsSubmitting(true);
    setStatus(null);
    try {
      // zodResolver already validated; the output matches CompanyRequestInput
      const result = await requestCompany(data as unknown as CompanyRequestInput);
      if (result && typeof result === 'object' && 'error' in result) {
        setStatus({ type: 'error', message: result.error as string });
      } else {
        setStatus({ type: 'success', message: 'Request submitted' });
        reset();
      }
    } catch {
      setStatus({
        type: 'error',
        message: 'Something went wrong. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {status && (
        <div
          className={`rounded-sm border px-4 py-3 text-sm ${
            status.type === 'success'
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          {status.message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Company details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(submit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Company name</Label>
              <Input
                id="name"
                {...register('name')}
                placeholder="e.g. Apple Inc."
              />
              {errors.name && (
                <p className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ticker">Ticker</Label>
              <Input
                id="ticker"
                {...register('ticker')}
                placeholder="e.g. AAPL"
                style={{ textTransform: 'uppercase' }}
              />
              {errors.ticker && (
                <p className="text-sm text-destructive">
                  {errors.ticker.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="isin">ISIN (optional)</Label>
              <Input id="isin" {...register('isin')} placeholder="e.g. US0378331005" />
              {errors.isin && (
                <p className="text-sm text-destructive">{errors.isin.message}</p>
              )}
            </div>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting…' : 'Submit request'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
