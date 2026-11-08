import { BadgeCheck } from "lucide-react";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import type { PreferencesView, PricingView } from "@yamboka/shared";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { IdentityForm, PasswordForm } from "@/components/profile/profile-forms";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { SessionsCard } from "@/components/settings/sessions-card";
import { NotificationPrefs } from "@/components/settings/settings-forms";
import { requireUser } from "@/lib/auth";
import { COUNTRY_COOKIE, GEO_HEADERS, pickCountry } from "@/lib/country";
import { publicGet, serverGet } from "@/lib/server-api";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Paramètres" };

/** Onglets : l'adresse (?onglet=) porte le choix, donc chaque onglet a son lien et les anciennes pages y redirigent. */
const TABS = [
  { id: "profil", label: "Profil" },
  { id: "notifications", label: "Notifications" },
  { id: "securite", label: "Sécurité" },
  { id: "preferences", label: "Préférences" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default async function SettingsPage({ searchParams }: PageProps<"/app/parametres">) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab: TabId = TABS.find((t) => t.id === sp.onglet)?.id ?? "profil";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Paramètres</h1>
        <p className="mt-1 text-muted-foreground">Votre profil, vos notifications, la sécurité et vos préférences.</p>
      </div>

      <nav aria-label="Sections des paramètres" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-1 rounded-xl bg-muted p-1 sm:w-fit">
          {TABS.map((t) => (
            <li key={t.id}>
              <Link
                href={`/app/parametres?onglet=${t.id}`}
                aria-current={t.id === tab ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/60",
                  t.id === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-label={TABS.find((t) => t.id === tab)?.label} className="space-y-6">
        {tab === "profil" && (
          <>
            <div className="flex items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{user.email}</span>
              {user.emailVerified ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-success"><BadgeCheck className="size-3.5" aria-hidden /> Confirmée</span>
              ) : (
                <Link href="/verifier-email" className="shrink-0 text-xs font-medium text-destructive underline">Non confirmée — confirmer</Link>
              )}
            </div>
            <IdentityForm user={user} />
          </>
        )}
        {tab === "notifications" && <NotificationsTab />}
        {tab === "securite" && (
          <>
            <div className="space-y-4">
              <h2 className="font-heading text-lg font-bold">Mot de passe</h2>
              {user.hasPassword ? <PasswordForm /> : <p className="text-sm text-muted-foreground">Votre compte utilise la connexion avec Google : il n’a pas de mot de passe.</p>}
            </div>
            <div className="space-y-3 border-t pt-6">
              <h2 className="font-heading text-lg font-bold">Appareils connectés</h2>
              <SessionsCard />
            </div>
          </>
        )}
        {tab === "preferences" && <PreferencesTab phone={user.phone} />}
      </section>
    </div>
  );
}

async function NotificationsTab() {
  const prefs = await serverGet<PreferencesView>("/preferences");
  return (
    <>
      <NotificationPrefs initial={prefs} />
      <section aria-labelledby="inbox-title" className="space-y-3 border-t pt-6">
        <h2 id="inbox-title" className="font-heading text-lg font-bold">Mes notifications</h2>
        <NotificationsList />
      </section>
      <p className="text-xs text-muted-foreground">Les notifications push ne sont pas disponibles pour le moment.</p>
    </>
  );
}

async function PreferencesTab({ phone }: { phone: string | null }) {
  const [pricing, jar, h] = await Promise.all([publicGet<PricingView>("/catalog/pricing"), cookies(), headers()]);
  const ip = GEO_HEADERS.map((name) => h.get(name)).find((v) => v && v !== "XX" && v !== "T1") ?? null;
  const { iso } = pickCountry(pricing.countries, { choice: jar.get(COUNTRY_COOKIE)?.value, ip, phone });
  return <PreferencesForm countries={pricing.countries} initialCountry={iso} />;
}
