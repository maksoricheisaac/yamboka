"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { changeEmailSchema, type ChangeEmailInput, type SessionUser } from "@yamboka/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPost, applyApiError } from "@/lib/api-client";
import { Field, describedBy } from "./field";
import { OtpForm, type OtpIssuedInfo } from "./otp-form";

/** Vérification de l'adresse e-mail par code : saisie, renvoi avec compte à rebours, correction de l'adresse. */
export function VerifyEmailCard({
  email: initialEmail,
  initialCooldown,
  codeLength,
  ttlMinutes,
  sent,
}: {
  email: string;
  initialCooldown: number;
  codeLength?: number;
  ttlMinutes?: number;
  /** Faux : l'e-mail d'inscription n'a pas pu partir (on le dit, et le renvoi est immédiat). */
  sent: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [editing, setEditing] = useState(false);
  const [cooldown, setCooldown] = useState(sent ? initialCooldown : 0);
  const [notSent, setNotSent] = useState(!sent);
  // Remonte le formulaire de code quand l'adresse change : état et compte à rebours repartent de zéro.
  const [epoch, setEpoch] = useState(0);

  if (editing) {
    return (
      <ChangeEmail
        current={email}
        onCancel={() => setEditing(false)}
        onDone={(user, otp) => {
          setEmail(user.email);
          setCooldown(otp.resendInSeconds);
          setNotSent(false);
          setEpoch((n) => n + 1);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <OtpForm
      key={epoch}
      email={email}
      initialCooldown={cooldown}
      codeLength={codeLength}
      ttlMinutes={ttlMinutes}
      notSentNotice={
        notSent ? "Nous n’avons pas pu envoyer l’e-mail. Vérifiez l’adresse, puis cliquez sur « Renvoyer le code »." : undefined
      }
      onVerify={async (code) => {
        await apiPost("/auth/verify-email", { code });
        router.replace("/app");
        router.refresh();
      }}
      onResend={async () => {
        const res = await apiPost<{ otp: OtpIssuedInfo }>("/auth/resend-verification");
        setNotSent(false);
        return res.otp;
      }}
      onChangeEmail={() => setEditing(true)}
    />
  );
}

function ChangeEmail({
  current,
  onCancel,
  onDone,
}: {
  current: string;
  onCancel: () => void;
  onDone: (user: SessionUser, otp: OtpIssuedInfo) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangeEmailInput>({ resolver: zodResolver(changeEmailSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const res = await apiPost<{ user: SessionUser; otp: OtpIssuedInfo }>("/auth/change-email", values);
      onDone(res.user, res.otp);
    } catch (e) {
      setFormError(applyApiError(e, setError, ["email"]));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Adresse actuelle : <strong className="text-foreground">{current}</strong>. Un nouveau code sera envoyé à la nouvelle adresse.
      </p>
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <Field id="email" label="Nouvelle adresse e-mail" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          aria-invalid={!!errors.email}
          aria-describedby={describedBy("email", errors.email?.message)}
          {...register("email")}
        />
      </Field>
      <div className="flex gap-3">
        <Button type="submit" size="lg" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? "Envoi…" : "Envoyer le code"}
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
