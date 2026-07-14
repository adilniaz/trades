import { requireAuth } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SettingsForm } from "@/app/admin/settings/settings-form";

export default async function AdminSettingsPage() {
  await requireAuth({ roles: ["ADMIN"] });
  const settings = await getSettings();

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Global Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Transaction Fee</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm currentFee={settings.transactionFee} />
        </CardContent>
      </Card>
    </div>
  );
}
