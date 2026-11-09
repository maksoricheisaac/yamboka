"use client";

import type { PaymentCountryView } from "@yamboka/shared";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { COUNTRY_COOKIE } from "@/lib/country";
import { useHydrated } from "@/lib/use-hydrated";
import { toast } from "@/components/ui/toaster";

const THEMES = [
  { value: "system", label: "Automatique", icon: Monitor },
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
] as const;

/**
 * Préférences d'affichage de ce navigateur : thème et pays de paiement. Ce sont des préférences d'interface,
 * pas des données de compte : elles restent sur l'appareil (cookie sans donnée personnelle).
 */
export function PreferencesForm({ countries, initialCountry }: { countries: PaymentCountryView[]; initialCountry: string }) {
  const hydrated = useHydrated();
  const { theme, setTheme } = useTheme();
  const [country, setCountry] = useState(initialCountry);

  function pickCountry(iso: string) {
    setCountry(iso);
    try {
      document.cookie = `${COUNTRY_COOKIE}=${iso}; path=/; max-age=31536000; samesite=lax`;
      toast.success("Pays enregistré.");
    } catch {
      toast.error("Impossible d’enregistrer ce choix sur cet appareil.");
    }
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="pref-lang" className="space-y-2">
        <h2 id="pref-lang" className="font-heading text-lg font-bold">Langue</h2>
        <p className="rounded-3xl bg-card shadow-card px-4 py-3 text-sm">
          <span className="font-medium">Français</span> <span className="text-muted-foreground">— seule langue disponible pour le moment.</span>
        </p>
      </section>

      <section aria-labelledby="pref-theme" className="space-y-2">
        <h2 id="pref-theme" className="font-heading text-lg font-bold">Apparence</h2>
        <div role="radiogroup" aria-labelledby="pref-theme" className="grid grid-cols-3 gap-2">
          {THEMES.map((t) => (
            <label key={t.value} className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border bg-card px-3 text-sm font-medium transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:ring-2 has-[:checked]:ring-primary/30 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
              <input type="radio" name="theme" value={t.value} checked={hydrated && theme === t.value} onChange={() => setTheme(t.value)} className="sr-only" />
              <t.icon className="size-4" aria-hidden /> {t.label}
            </label>
          ))}
        </div>
      </section>

      {countries.length > 0 && (
        <section aria-labelledby="pref-country" className="space-y-2">
          <h2 id="pref-country" className="font-heading text-lg font-bold">Pays de paiement</h2>
          <p className="text-sm text-muted-foreground">Détermine la devise, les prix et les moyens de paiement proposés pour l’achat de crédits.</p>
          <select
            aria-labelledby="pref-country"
            value={country}
            onChange={(e) => pickCountry(e.target.value)}
            className="h-11 w-full rounded-xl border bg-card px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/60 sm:w-80"
          >
            {countries.map((c) => (
              <option key={c.iso} value={c.iso}>
                {c.name} ({c.currency})
              </option>
            ))}
          </select>
        </section>
      )}
    </div>
  );
}
