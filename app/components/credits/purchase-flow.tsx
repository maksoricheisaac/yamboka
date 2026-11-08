"use client";

import {
  customPurchaseAmount,
  packEquivalents,
  phoneCountry,
  REFERENCE_VIDEO_SECONDS,
  type CountryCode,
  type CreatePaymentInput,
  type CreditRates,
  type PaymentCountryView,
  type PaymentQuoteView,
  type PaymentView,
} from "@yamboka/shared";
import { Check, Globe2, Minus, Plus, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { ApiError, apiPost } from "@/lib/api-client";
import { COUNTRY_COOKIE, type CountrySource } from "@/lib/country";
import { formatMoney, formatNumber, formatUnitPrice } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

type Mode = "pack" | "custom";

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <span className="mb-2 flex items-center gap-2 text-sm font-semibold">
      <span aria-hidden className="grid size-5 place-items-center rounded-full bg-primary text-[0.7rem] font-bold text-primary-foreground">
        {n}
      </span>
      {children}
    </span>
  );
}

const choiceClass =
  "cursor-pointer rounded-xl border bg-card transition-colors hover:border-primary/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:ring-2 has-[:checked]:ring-primary/30 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring";

/** Numéro déjà connu, gardé seulement s'il appartient au pays du paiement. */
function phoneFor(country: PaymentCountryView, phone: string | null | undefined): string {
  return phone && phoneCountry(phone) === country.iso ? phone : "";
}

/**
 * Achat de crédits : quantité (pack ou à la carte) → pays et moyen de paiement → numéro → vérification.
 * Les montants affichés sont un CONFORT : le serveur recalcule tout (devis puis création) et le formulaire
 * se corrige si le prix a changé entre-temps. Rien ici ne décide de ce qui est facturé ni crédité.
 */
export function PurchaseFlow({
  countries,
  initialCountry,
  countrySource,
  balance,
  defaultPhone,
  emailVerified,
  rates,
}: {
  countries: PaymentCountryView[];
  initialCountry: string;
  countrySource: CountrySource;
  balance: number;
  defaultPhone: string | null;
  emailVerified: boolean;
  rates: CreditRates;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const uid = useId();

  const [iso, setIso] = useState(initialCountry);
  const country = countries.find((c) => c.iso === iso) ?? countries[0];
  const featured = (c: PaymentCountryView) => (c.packs.find((p) => p.featured) ?? c.packs[0])?.id ?? null;

  const [mode, setMode] = useState<Mode>(country.packs.length > 0 ? "pack" : "custom");
  const [packId, setPackId] = useState<string | null>(featured(country));
  const [creditsText, setCreditsText] = useState(country.packs.length === 0 && country.custom ? String(country.custom.minCredits) : "");
  const [network, setNetwork] = useState(country.methods[0]?.code ?? "");
  const [phone, setPhone] = useState(phoneFor(country, defaultPhone));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ credits?: string; phone?: string }>({});

  const custom = country.custom;
  const selectedPack = country.packs.find((p) => p.id === packId) ?? null;
  const parsed = /^\d+$/.test(creditsText.trim()) ? Number(creditsText.trim()) : null;
  const customCredits = parsed !== null && custom && parsed >= custom.minCredits && parsed <= custom.maxCredits ? parsed : null;
  const customAmount = customCredits !== null && custom ? customPurchaseAmount(customCredits, custom.unitPrice) : null;

  const credits = mode === "pack" ? (selectedPack?.baseCredits ?? null) : customCredits;
  const amount = mode === "pack" ? (selectedPack?.priceFcfa ?? null) : customAmount;
  const videos = credits !== null ? packEquivalents(credits, rates)["480p"].videos : 0;

  // Les mouvements affichés ne dépendent que du pays : on remet les choix à zéro quand il change.
  function changeCountry(next: string) {
    const c = countries.find((x) => x.iso === next);
    if (!c) return;
    setIso(c.iso);
    setMode(c.packs.length > 0 ? "pack" : "custom");
    setPackId(featured(c));
    setCreditsText(c.packs.length === 0 && c.custom ? String(c.custom.minCredits) : "");
    setNetwork(c.methods[0]?.code ?? "");
    setPhone(phoneFor(c, phone || defaultPhone));
    setError(null);
    setFieldErrors({});
    try {
      document.cookie = `${COUNTRY_COOKIE}=${c.iso}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // Cookies bloqués : le choix vaut pour cette visite seulement.
    }
  }

  // Quantité proposée d'office la première fois qu'on ouvre l'achat à la carte.
  function chooseMode(next: Mode) {
    setMode(next);
    if (next === "custom" && creditsText === "" && custom) setCreditsText(String(custom.minCredits));
  }

  // Quantités rapides exprimées en vidéos de référence (Standard, 5 s), bornées par les règles du pays.
  const perVideo = rates["480p"] * REFERENCE_VIDEO_SECONDS;
  const seen = new Set<number>();
  const quick =
    custom && perVideo > 0
      ? [1, 5, 10, 20]
          .map((n) => ({ value: n * perVideo, label: `${n} vidéo${n > 1 ? "s" : ""}` }))
          .filter((q) => q.value >= custom.minCredits && q.value <= custom.maxCredits && !seen.has(q.value) && seen.add(q.value))
      : [];

  function step(delta: number) {
    if (!custom) return;
    const base = parsed ?? custom.minCredits;
    const next = Math.min(Math.max(base + delta, custom.minCredits), custom.maxCredits);
    setCreditsText(String(next));
  }

  const ready = hydrated && emailVerified && !submitting && credits !== null && amount !== null && network !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const errs: { credits?: string; phone?: string } = {};
    if (mode === "custom" && customCredits === null && custom) {
      errs.credits = `Choisissez entre ${formatNumber(custom.minCredits)} et ${formatNumber(custom.maxCredits)} crédits.`;
    }
    if (!phone) errs.phone = "Indiquez le numéro qui paie.";
    setFieldErrors(errs);
    if (errs.credits || errs.phone || credits === null || amount === null) return;

    const order = mode === "pack" && selectedPack ? { packId: selectedPack.id } : { credits };
    setSubmitting(true);
    try {
      // Le serveur recalcule le montant : si le prix a bougé depuis l'affichage, on le montre AVANT de débiter.
      const quote = await apiPost<PaymentQuoteView>("/payments/quote", { ...order, country: country.iso, network });
      if (quote.amount !== amount || quote.credits !== credits) {
        setError(`Le tarif vient d’être mis à jour : ${formatNumber(quote.credits)} crédits pour ${formatMoney(quote.amount, quote.currency)}. Vérifiez puis confirmez à nouveau.`);
        router.refresh();
        return;
      }
      const body: CreatePaymentInput = { ...order, country: country.iso, network, phone };
      const { payment } = await apiPost<{ payment: PaymentView }>("/payments", body);
      // Certains réseaux exigent une page de paiement hébergée. Le retour sur notre page ne prouve rien :
      // le suivi interroge toujours notre serveur.
      if (payment.checkoutUrl) {
        window.location.assign(payment.checkoutUrl);
        return;
      }
      router.push(`/app/credits/paiement/${payment.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        // Erreurs de validation du serveur : affichées sous le champ concerné, avec ses mots à lui.
        const phoneError = err.details.find((d) => d.field === "phone")?.message;
        const creditsError = err.details.find((d) => d.field === "credits")?.message;
        if (phoneError || creditsError) setFieldErrors({ phone: phoneError, credits: creditsError });
        else setError(err.message);
      } else {
        setError("Le paiement n’a pas pu démarrer. Vérifiez votre connexion puis réessayez.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = !emailVerified;

  return (
    <form onSubmit={submit} noValidate className="space-y-6 pb-44 lg:pb-0">
      {!emailVerified && (
        <Alert className="border-accent bg-accent/15" role="status">
          <AlertDescription>Confirmez d’abord votre adresse e-mail (lien reçu par e-mail) : l’achat de crédits est bloqué tant qu’elle ne l’est pas.</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {countries.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border bg-card px-3.5 py-2.5">
          <label htmlFor={`${uid}-country`} className="flex items-center gap-2 text-sm font-medium">
            <Globe2 className="size-4 text-primary" aria-hidden /> Je paie depuis
          </label>
          <select
            id={`${uid}-country`}
            value={iso}
            disabled={disabled}
            onChange={(e) => changeCountry(e.target.value)}
            className="h-9 min-w-0 rounded-lg border bg-background px-2.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
          >
            {countries.map((c) => (
              <option key={c.iso} value={c.iso}>
                {c.name} ({c.currency})
              </option>
            ))}
          </select>
          {countrySource === "ip" && iso === initialCountry && <span className="text-xs text-muted-foreground">Détecté automatiquement</span>}
        </div>
      )}

      <fieldset disabled={disabled} className="space-y-3">
        <legend className="w-full">
          <Step n={1}>Combien de crédits ?</Step>
        </legend>

        {custom && country.packs.length > 0 && (
          <div role="radiogroup" aria-label="Type d’achat" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:w-fit">
            {(["pack", "custom"] as const).map((m) => (
              <label
                key={m}
                className="flex h-10 cursor-pointer items-center justify-center rounded-lg px-4 text-sm font-medium text-muted-foreground transition-colors has-[:checked]:bg-background has-[:checked]:text-foreground has-[:checked]:shadow-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
              >
                <input type="radio" name={`${uid}-mode`} value={m} checked={mode === m} onChange={() => chooseMode(m)} className="sr-only" />
                {m === "pack" ? "Choisir un pack" : "Choisir la quantité"}
              </label>
            ))}
          </div>
        )}

        {mode === "pack" && country.packs.length > 0 && (
          <div className="grid gap-2.5 sm:grid-cols-3">
            {country.packs.map((pack) => (
              <label key={pack.id} className={cn(choiceClass, "group relative flex flex-col p-4")}>
                <input type="radio" name={`${uid}-pack`} value={pack.id} checked={packId === pack.id} onChange={() => setPackId(pack.id)} className="sr-only" />
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{pack.name}</span>
                  {pack.featured && <span className="rounded-full bg-accent px-2 py-0.5 text-[0.65rem] font-bold text-accent-foreground">Le plus choisi</span>}
                </span>
                <span className="mt-1.5 font-heading text-2xl font-bold leading-none">
                  {formatNumber(pack.totalCredits)} <span className="text-sm font-medium text-muted-foreground">crédits</span>
                </span>
                <span className="mt-1 text-sm font-semibold">{formatMoney(pack.priceFcfa, country.currency)}</span>
                {pack.equivalent["480p"].videos > 0 && <span className="mt-1 text-xs text-muted-foreground">≈ {formatNumber(pack.equivalent["480p"].videos)} vidéos de {REFERENCE_VIDEO_SECONDS} s</span>}
                {pack.bonusPercent > 0 && <span className="mt-1 text-xs font-medium text-success">+{pack.bonusPercent} % offerts au 1er achat</span>}
                <Check className="absolute bottom-3 right-3 hidden size-5 rounded-full bg-primary p-0.5 text-primary-foreground group-has-[:checked]:block" aria-hidden />
              </label>
            ))}
          </div>
        )}

        {mode === "custom" && custom && (
          <div className="space-y-3 rounded-2xl border bg-card p-4">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor={`${uid}-credits`} className="mb-1.5 block text-sm font-medium">
                  Nombre de crédits
                </label>
                <div className="flex items-center gap-1.5">
                  <Button type="button" variant="outline" size="icon-lg" aria-label="Moins de crédits" onClick={() => step(-25)} disabled={disabled}>
                    <Minus aria-hidden />
                  </Button>
                  <Input
                    id={`${uid}-credits`}
                    inputMode="numeric"
                    autoComplete="off"
                    value={creditsText}
                    onChange={(e) => setCreditsText(e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
                    aria-invalid={!!fieldErrors.credits || (parsed !== null && customCredits === null)}
                    aria-describedby={`${uid}-credits-hint`}
                    className="h-11 text-center text-lg font-semibold tabular-nums"
                  />
                  <Button type="button" variant="outline" size="icon-lg" aria-label="Plus de crédits" onClick={() => step(25)} disabled={disabled}>
                    <Plus aria-hidden />
                  </Button>
                </div>
              </div>
            </div>
            <p id={`${uid}-credits-hint`} className={cn("text-sm", fieldErrors.credits || (parsed !== null && customCredits === null) ? "font-medium text-destructive" : "text-muted-foreground")}>
              {fieldErrors.credits ??
                (parsed !== null && customCredits === null
                  ? `Choisissez entre ${formatNumber(custom.minCredits)} et ${formatNumber(custom.maxCredits)} crédits.`
                  : `Minimum ${formatNumber(custom.minCredits)} crédits · 1 crédit = ${formatUnitPrice(custom.unitPrice, country.currency)}`)}
            </p>
            {quick.length > 0 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Quantités rapides">
                {quick.map((q) => (
                  <button
                    key={q.value}
                    type="button"
                    onClick={() => setCreditsText(String(q.value))}
                    aria-pressed={parsed === q.value}
                    className={cn(
                      "h-9 rounded-full border px-3.5 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/60",
                      parsed === q.value ? "border-primary bg-primary/10 font-medium text-primary" : "bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {q.label} · {formatNumber(q.value)}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Achat à la carte : sans bonus, réservé aux packs.</p>
          </div>
        )}
      </fieldset>

      <fieldset disabled={disabled}>
        <legend className="w-full">
          <Step n={2}>Moyen de paiement</Step>
        </legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {country.methods.map((m) => (
            <label key={m.code} className={cn(choiceClass, "flex min-h-12 items-center gap-3 px-4")}>
              <input type="radio" name={`${uid}-method`} value={m.code} checked={network === m.code} onChange={() => setNetwork(m.code)} className="size-4 accent-[var(--primary)]" />
              <span className="text-sm font-medium">{m.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={disabled} className="space-y-1.5">
        <legend className="w-full">
          <Step n={3}>Le numéro qui paie</Step>
        </legend>
        <PhoneInput
          key={country.iso}
          id={`${uid}-phone`}
          name="phone"
          aria-label="Numéro qui paie"
          value={phone}
          onChange={setPhone}
          countries={[country.iso as CountryCode]}
          defaultCountry={country.iso as CountryCode}
          aria-invalid={!!fieldErrors.phone}
          aria-describedby={`${uid}-phone-hint`}
        />
        <p id={`${uid}-phone-hint`} className={cn("text-sm", fieldErrors.phone ? "font-medium text-destructive" : "text-muted-foreground")}>
          {fieldErrors.phone ?? `Numéro ${country.name} (${country.dialCode}). Vous confirmerez le paiement sur ce téléphone.`}
        </p>
      </fieldset>

      <section
        aria-labelledby={`${uid}-recap`}
        className="fixed inset-x-0 bottom-16 z-30 space-y-2 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:static lg:z-auto lg:space-y-3 lg:rounded-2xl lg:border lg:bg-secondary/50 lg:p-4 lg:backdrop-blur-none"
      >
        <h2 id={`${uid}-recap`} className="hidden items-center gap-2 text-sm font-semibold lg:flex">
          <span aria-hidden className="grid size-5 place-items-center rounded-full bg-primary text-[0.7rem] font-bold text-primary-foreground">
            4
          </span>
          Vérifiez et payez
        </h2>
        {credits !== null && amount !== null ? (
          <div className="space-y-1 text-sm" aria-live="polite">
            <p>
              <strong>{formatNumber(credits)} crédits</strong>
              {videos > 0 && <span className="text-muted-foreground"> · ≈ {formatNumber(videos)} vidéos de {REFERENCE_VIDEO_SECONDS} s</span>}
              {" "}— à payer : <strong>{formatMoney(amount, country.currency)}</strong>
            </p>
            <p className="text-muted-foreground">
              Solde : {formatNumber(balance)} → <strong className="text-foreground">{formatNumber(balance + credits)} crédits</strong>
              {mode === "pack" && selectedPack && selectedPack.bonusPercent > 0 ? " (hors bonus)" : ""}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{mode === "pack" ? "Choisissez un pack pour voir le détail." : "Indiquez un nombre de crédits pour voir le prix."}</p>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0 text-success" aria-hidden /> Aucun frais en plus. Vos crédits sont ajoutés dès que le paiement est confirmé.
        </p>
        <Button type="submit" size="lg" className="h-11 w-full sm:w-auto" disabled={!ready}>
          {submitting ? "Vérification…" : amount !== null ? `Payer ${formatMoney(amount, country.currency)}` : "Payer"}
        </Button>
      </section>
    </form>
  );
}
