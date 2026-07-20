'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
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
  } = useForm<CompanyRequestInput>({
    resolver: zodResolver(companyRequestSchema),
    defaultValues: {
      name: searchParams.get('name') ?? '',
      ticker: '',
      isin: searchParams.get('isin') ?? '',
    },
  });

  const submit = async (data: CompanyRequestInput) => {
    setIsSubmitting(true);
    setStatus(null);
    try {
      const result = await requestCompany(data);
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
