import type { Metadata } from "next";
import type { PreferencesView } from "@yamboka/shared";
import { AccountSummary, NotificationPrefs } from "@/components/settings/settings-forms";
import { requireUser } from "@/lib/auth";
import { formatPhone } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const user = await requireUser();
  const prefs = await serverGet<PreferencesView>("/preferences");
  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <div>
        <h1 className="text-3xl font-bold">Paramètres</h1>
        <p className="mt-1 text-muted-foreground">Vos préférences de notification et les informations de votre compte.</p>
      </div>
      <NotificationPrefs initial={prefs} />
      <AccountSummary name={`${user.firstName} ${user.lastName}`.trim()} email={user.email} emailVerified={prefs.emailVerified} phone={user.phone ? formatPhone(user.phone) : null} />
    </div>
  );
}
