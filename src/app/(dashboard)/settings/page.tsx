import { DownloadIcon } from 'lucide-react';
import { requireAuth } from '@/lib/auth-guard';
import { getSettings } from '@/lib/settings';
import { ChangePasswordForm } from './change-password-form';
import { PageHeading } from '@/components/layout/page-heading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function SettingsPage() {
  await requireAuth({ roles: ['USER'] });
  const { transactionFee } = await getSettings();

  return (
    <div className="max-w-md space-y-6">
      <PageHeading>Settings</PageHeading>

      <Card>
        <CardHeader>
          <CardTitle>Transaction fee</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Used in breakeven calculations:{' '}
            <span className="font-mono tabular-nums text-foreground">
              {transactionFee.toFixed(2)}
            </span>
            . Set globally by an admin.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export data</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <a
            href="/api/export"
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <DownloadIcon className="size-4" aria-hidden="true" />
            Export my transactions (CSV)
          </a>
          <a
            href="/api/export/holdings"
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <DownloadIcon className="size-4" aria-hidden="true" />
            Export my holdings (CSV)
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
