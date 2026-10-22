"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@yamboka/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPost, applyApiError } from "@/lib/api-client";
import { useHydrated } from "@/lib/use-hydrated";
import { safeNext } from "@/lib/safe-redirect";
import { Field, describedBy } from "./field";
import { PasswordInput } from "./password-input";

const ERRORS: Record<string, string> = {
  google_etat: "La connexion avec Google a expiré. Veuillez réessayer.",
  google_refuse: "La connexion avec Google a été annulée.",
  google_email: "L’adresse e-mail de votre compte Google n’est pas vérifiée.",
  compte_suspendu: "Ce compte est suspendu ou banni. Contactez le support.",
  google: "La connexion avec Google a échoué. Veuillez réessayer.",
};

export function LoginForm() {
  const router = useRouter();
  const hydrated = useHydrated();
  const params = useSearchParams();
  const next = safeNext(params.get("suivant"));
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
      await apiPost("/auth/login", values);
      router.replace(next);
      router.refresh();
    } catch (e) {
      setFormError(applyApiError(e, setError, ["email", "password"]));
    }
  });

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
      <Button type="submit" size="lg" className="w-full" disabled={!hydrated || isSubmitting}>
        {isSubmitting ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
