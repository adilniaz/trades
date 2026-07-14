import { requireAuth } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { ChangePasswordForm } from "./change-password-form";

export default async function SettingsPage() {
  await requireAuth();
  const { transactionFee } = await getSettings();

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      <p className="text-sm text-muted-foreground">
        Current transaction fee (used in breakeven calculations): {transactionFee.toFixed(2)}.
        This is set globally by an admin.
      </p>
      <a href="/api/export" className="text-sm underline">
        Export my transactions (CSV)
      </a>
      <br />
      <a href="/api/export/holdings" className="text-sm underline">
        Export my holdings (CSV)
      </a>
      <ChangePasswordForm />
    </div>
  );
}
