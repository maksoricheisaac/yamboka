"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createPaymentSchema, type CreatePaymentInput, type PackView, type PaymentView } from "@yamboka/shared";
import { Check, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Field, describedBy } from "@/components/auth/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";
import { normalizePhone } from "@yamboka/shared";
import { apiPost, applyApiError } from "@/lib/api-client";
import { formatFcfa, formatNumber } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";
import { OPERATOR_LABELS } from "./labels";

function Legend({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <legend className="mb-2 flex items-center gap-2 text-sm font-semibold">
      <span aria-hidden className="grid size-5 place-items-center rounded-full bg-primary text-[0.7rem] font-bold text-primary-foreground">{n}</span>
      {children}
    </legend>
  );
}

/**
 * Recharge compacte : pack → opérateur → numéro → vérification → paiement. Le formulaire n'est qu'un résumé :
 * montant et crédits sont recalculés par le serveur à la création. Sur mobile, le récapitulatif et le bouton
 * restent collés au-dessus de la barre d'onglets.
 */
export function PurchaseForm({
  packs,
  defaultPhone,
  emailVerified,
}: {
  packs: PackView[];
  defaultPhone: string | null;
  emailVerified: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreatePaymentInput>({
    resolver: zodResolver(createPaymentSchema),
    defaultValues: {
      packId: packs.find((p) => p.featured)?.id,
      // Le paiement passe par MTN / Airtel Congo : un numéro d'un autre pays n'est pas proposé par défaut.
      // Valeur initiale vide (jamais « undefined ») : sinon la validation affiche son message anglais brut.
      phone: defaultPhone && normalizePhone(defaultPhone)?.startsWith("+242") ? defaultPhone : "",
    },
  });

  const selectedId = useWatch({ control, name: "packId" });
  const selected = packs.find((p) => p.id === selectedId);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { payment } = await apiPost<{ payment: PaymentView }>("/payments", values);
      router.push(`/app/credits/paiement/${payment.id}`);
    } catch (e) {
      setFormError(applyApiError(e, setError, ["packId", "operator", "phone"]));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5 pb-40 lg:pb-0">
      {!emailVerified && (
        <Alert className="border-accent bg-accent/15" role="status">
          <AlertDescription>
            Confirmez d’abord votre adresse e-mail (lien reçu par e-mail) : l’achat de crédits est bloqué tant qu’elle ne l’est pas.
          </AlertDescription>
        </Alert>
      )}
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <fieldset disabled={!emailVerified}>
        <Legend n={1}>Choisissez un pack</Legend>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {packs.map((pack) => (
            <label
              key={pack.id}
              className="group relative flex cursor-pointer flex-col rounded-2xl border bg-card p-4 transition-colors hover:border-primary/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:ring-2 has-[:checked]:ring-primary/30 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
            >
              <input type="radio" value={pack.id} className="sr-only" {...register("packId")} />
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{pack.name}</span>
                {pack.featured && <span className="rounded-full bg-accent px-2 py-0.5 text-[0.65rem] font-bold text-accent-foreground">Le plus choisi</span>}
              </span>
              <span className="mt-1.5 font-heading text-2xl font-bold leading-none">
                {formatNumber(pack.totalCredits)} <span className="text-sm font-medium text-muted-foreground">crédits</span>
              </span>
              <span className="mt-1 text-sm font-semibold">{formatFcfa(pack.priceFcfa)}</span>
              {pack.bonusPercent > 0 && <span className="mt-1 text-xs font-medium text-success">+{pack.bonusPercent} % offerts au 1er achat</span>}
              <Check className="absolute bottom-3 right-3 hidden size-5 rounded-full bg-primary p-0.5 text-primary-foreground group-has-[:checked]:block" aria-hidden />
            </label>
          ))}
        </div>
        {errors.packId && <p role="alert" className="mt-1.5 text-sm font-medium text-destructive">{errors.packId.message}</p>}
      </fieldset>

      <fieldset disabled={!emailVerified}>
        <Legend n={2}>Votre opérateur mobile money</Legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {(Object.keys(OPERATOR_LABELS) as (keyof typeof OPERATOR_LABELS)[]).map((op) => (
            <label
              key={op}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:ring-2 has-[:checked]:ring-primary/30 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
            >
              <input type="radio" value={op} className="size-4 accent-[var(--primary)]" {...register("operator")} />
              <span className="text-sm font-medium">{OPERATOR_LABELS[op]}</span>
            </label>
          ))}
        </div>
        {errors.operator && <p role="alert" className="mt-1.5 text-sm font-medium text-destructive">{errors.operator.message}</p>}
      </fieldset>

      <fieldset disabled={!emailVerified}>
        <Legend n={3}>Le numéro qui paie</Legend>
        <Field
          id="phone"
          label="Numéro qui paie"
          hint="Numéro MTN ou Airtel du Congo. Vous confirmerez le paiement sur ce téléphone."
          error={errors.phone?.message}
        >
          <Controller
            control={control}
            name="phone"
            render={({ field }) => (
              <PhoneInput
                id="phone"
                name={field.name}
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                countries={["CG"]}
                aria-invalid={!!errors.phone}
                aria-describedby={describedBy("phone", errors.phone?.message, "hint")}
              />
            )}
          />
        </Field>
      </fieldset>

      <section
        aria-labelledby="recap"
        className="fixed inset-x-0 bottom-16 z-30 space-y-2 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:static lg:z-auto lg:space-y-3 lg:rounded-2xl lg:border lg:bg-secondary/50 lg:p-4 lg:backdrop-blur-none"
      >
        <h2 id="recap" className="hidden items-center gap-2 text-sm font-semibold lg:flex">
          <span aria-hidden className="grid size-5 place-items-center rounded-full bg-primary text-[0.7rem] font-bold text-primary-foreground">4</span>
          Vérifiez et payez
        </h2>
        {selected ? (
          <p className="text-sm">
            Vous payez <strong>{formatFcfa(selected.priceFcfa)}</strong> et recevez <strong>{formatNumber(selected.totalCredits)} crédits</strong>.
            <span className="hidden lg:inline"> Le paiement n’est confirmé qu’après votre validation sur votre téléphone.</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Choisissez un pack pour voir le détail.</p>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0 text-success" aria-hidden /> Aucun frais en plus : vous payez exactement le prix affiché.
        </p>
        <Button type="submit" size="lg" className="h-11 w-full sm:w-auto" disabled={!hydrated || !emailVerified || isSubmitting}>
          {isSubmitting ? "Envoi…" : selected ? `Payer ${formatFcfa(selected.priceFcfa)}` : "Payer"}
        </Button>
      </section>
    </form>
  );
}
