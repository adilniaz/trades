import { requireAuth } from '@/lib/auth-guard';
import { getSettings } from '@/lib/settings';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SettingsForm } from '@/app/(dashboard)/admin/settings/settings-form';
import { PageHeading } from '@/components/layout/page-heading';

export default async function AdminSettingsPage() {
  await requireAuth({ roles: ['ADMIN'] });
  const settings = await getSettings();

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeading>Global settings</PageHeading>

      <Card>
        <CardHeader>
          <CardTitle>Transaction fee</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm currentFee={settings.transactionFee} />
        </CardContent>
      </Card>
    </div>
  );
}
