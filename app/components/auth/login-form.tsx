"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput, type SessionUser } from "@yamboka/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { apiPost, applyApiError } from "@/lib/api-client";
import { OtpForm, type OtpIssuedInfo } from "./otp-form";
import { useHydrated } from "@/lib/use-hydrated";
import { safeNext } from "@/lib/safe-redirect";
import { Field, describedBy } from "./field";
import { PasswordInput } from "./password-input";
import { SubmitButton } from "./submit-button";

const ERRORS: Record<string, string> = {
  google_etat: "La connexion avec Google a expiré. Veuillez réessayer.",
  google_refuse: "La connexion avec Google a été annulée.",
  google_email: "L’adresse e-mail de votre compte Google n’est pas vérifiée.",
  compte_suspendu: "Ce compte est suspendu ou banni. Contactez le support.",
  google: "La connexion avec Google a échoué. Veuillez réessayer.",
};

export function LoginForm({ codeLength, ttlMinutes }: { codeLength?: number; ttlMinutes?: number } = {}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const params = useSearchParams();
  const requested = params.get("suivant");
  const next = safeNext(requested);
  const [challenge, setChallenge] = useState<{ email: string; password: string; otp: OtpIssuedInfo } | null>(null);

  /** Après connexion : page demandée si elle existe, sinon l'espace du rôle (administration ou espace client). */
  function landOn(user: SessionUser) {
    router.replace(requested ? next : user.role === "ADMIN" ? "/admin" : "/app");
    router.refresh();
  }
  const [formError, setFormError] = useState<string | null>(ERRORS[params.get("erreur") ?? ""] ?? null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
    } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) }); // pas de valeurs par défaut vides : elles effaceraient une saisie faite avant l'hydratation

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const res = await apiPost<{ user?: SessionUser; otpRequired?: boolean; otp?: OtpIssuedInfo }>("/auth/login", values);
      if (res.otpRequired && res.otp) {
        // Mot de passe correct : aucune session n'est ouverte avant le code reçu par e-mail.
        setChallenge({ email: values.email, password: values.password, otp: res.otp });
        return;
      }
      landOn(res.user!);
    } catch (e) {
      setFormError(applyApiError(e, setError, ["email", "password"]));
    }
  });

  if (challenge) {
    return (
      <div className="space-y-4">
        <OtpForm
          email={challenge.email}
          initialCooldown={challenge.otp.resendInSeconds}
          codeLength={codeLength}
          ttlMinutes={ttlMinutes}
          onVerify={async (code) => {
            const res = await apiPost<{ user: SessionUser }>("/auth/login/verify", { email: challenge.email, code });
            landOn(res.user);
          }}
          onResend={async () => {
            const res = await apiPost<{ otp: OtpIssuedInfo }>("/auth/login/resend", {
              email: challenge.email,
              password: challenge.password,
            });
            return res.otp;
          }}
          onChangeEmail={() => setChallenge(null)}
        />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <Field id="email" label="Adresse e-mail" error={errors.email?.message}>
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
      <Field id="password" label="Mot de passe" error={errors.password?.message}>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          aria-describedby={describedBy("password", errors.password?.message)}
          {...register("password")}
        />
      </Field>
      <div className="text-right">
        <Link href="/mot-de-passe-oublie" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Mot de passe oublié ?
        </Link>
      </div>
      <SubmitButton disabled={!hydrated} loading={isSubmitting} loadingLabel="Connexion…">
        Se connecter
      </SubmitButton>
    </form>
  );
}
