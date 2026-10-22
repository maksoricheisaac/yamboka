"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createPaymentSchema, type CreatePaymentInput, type PackView, type PaymentView } from "@yamboka/shared";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Field, describedBy } from "@/components/auth/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPost, applyApiError } from "@/lib/api-client";
import { formatFcfa, formatNumber } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";
import { OPERATOR_LABELS } from "./labels";

/** Le formulaire est un simple résumé : montant et crédits sont recalculés par le serveur à la création. */
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
      ...(defaultPhone ? { phone: defaultPhone } : {}),
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
    <form onSubmit={onSubmit} noValidate className="space-y-8">
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

      <fieldset className="space-y-3" disabled={!emailVerified}>
        <legend className="mb-1 font-heading text-lg font-bold">1. Choisissez un pack</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {packs.map((pack) => (
            <label
              key={pack.id}
              className="group relative flex cursor-pointer flex-col rounded-2xl border bg-card p-4 shadow-soft transition-colors has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/30 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
            >
              <input type="radio" value={pack.id} className="peer sr-only" {...register("packId")} />
              <span className="flex items-start justify-between gap-2">
                <span className="font-heading text-lg font-bold">{pack.name}</span>
                <Check className="size-5 rounded-full bg-primary p-0.5 text-primary-foreground opacity-0 group-has-[:checked]:opacity-100" aria-hidden />
              </span>
              <span className="mt-1 font-heading text-2xl font-bold">{formatFcfa(pack.priceFcfa)}</span>
              <span className="text-sm text-muted-foreground">
                {formatNumber(pack.totalCredits)} crédits
                {pack.bonusPercent > 0 && <span className="font-medium text-success"> (+{pack.bonusPercent} % offerts)</span>}
              </span>
              <span className="mt-2 text-xs text-muted-foreground">
                ≈ {pack.equivalent.videoSeconds} s de vidéo ou {pack.equivalent.images} images
              </span>
            </label>
          ))}
        </div>
        {errors.packId && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {errors.packId.message}
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-3" disabled={!emailVerified}>
        <legend className="mb-1 font-heading text-lg font-bold">2. Votre opérateur mobile money</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(OPERATOR_LABELS) as (keyof typeof OPERATOR_LABELS)[]).map((op) => (
            <label
              key={op}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border bg-card p-4 transition-colors has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/30 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
            >
              <input type="radio" value={op} className="size-5 accent-[var(--primary)]" {...register("operator")} />
              <span className="font-medium">{OPERATOR_LABELS[op]}</span>
            </label>
          ))}
        </div>
        {errors.operator && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {errors.operator.message}
          </p>
        )}
        <Field
          id="phone"
          label="Numéro qui paie"
          hint="Format 242XXXXXXXXX. Vous confirmerez le paiement sur ce téléphone."
          error={errors.phone?.message}
        >
          <Input
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="242060000000"
            aria-invalid={!!errors.phone}
            aria-describedby={describedBy("phone", errors.phone?.message, "hint")}
            {...register("phone")}
          />
        </Field>
      </fieldset>

      <section aria-labelledby="recap" className="space-y-4 rounded-2xl border bg-secondary/50 p-5">
        <h2 id="recap" className="font-heading text-lg font-bold">
          3. Vérifiez et payez
        </h2>
        {selected ? (
          <p>
            Vous payez <strong>{formatFcfa(selected.priceFcfa)}</strong> et recevez <strong>{formatNumber(selected.totalCredits)} crédits</strong>.
            Le paiement n’est confirmé qu’après votre validation sur votre téléphone.
          </p>
        ) : (
          <p className="text-muted-foreground">Choisissez un pack pour voir le détail.</p>
        )}
        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={!hydrated || !emailVerified || isSubmitting}>
          {isSubmitting ? "Envoi…" : selected ? `Payer ${formatFcfa(selected.priceFcfa)}` : "Payer"}
        </Button>
      </section>
    </form>
  );
}
