"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordSchema, type ResetPasswordInput } from "@yamboka/shared";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { apiPost, applyApiError } from "@/lib/api-client";
import { useHydrated } from "@/lib/use-hydrated";
import { Field, describedBy } from "./field";
import { PasswordInput } from "./password-input";

export function ResetForm() {
  const hydrated = useHydrated();
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token }, // le jeton n'est pas un champ saisi ; les mots de passe restent sans valeur par défaut
  });

  if (!token) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>
          Ce lien est incomplet. <Link href="/mot-de-passe-oublie" className="font-medium underline">Demandez-en un nouveau</Link>.
        </AlertDescription>
      </Alert>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Alert role="status">
          <AlertDescription>Votre mot de passe a été modifié.</AlertDescription>
        </Alert>
        <Button asChild size="lg" className="w-full">
          <Link href="/connexion">Se connecter</Link>
        </Button>
      </div>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await apiPost("/auth/reset-password", { ...values, token });
      setDone(true);
    } catch (e) {
      setFormError(applyApiError(e, setError, ["password", "confirmPassword"]));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {formError}{" "}
            {formError.includes("lien") && (
              <Link href="/mot-de-passe-oublie" className="font-medium underline">
                Demander un nouveau lien
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}
      <Field id="password" label="Nouveau mot de passe" hint="8 caractères minimum." error={errors.password?.message}>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          aria-describedby={describedBy("password", errors.password?.message, "hint")}
          {...register("password")}
        />
      </Field>
      <Field id="confirmPassword" label="Confirmer le mot de passe" error={errors.confirmPassword?.message}>
        <PasswordInput
          id="confirmPassword"
          autoComplete="new-password"
          aria-invalid={!!errors.confirmPassword}
          aria-describedby={describedBy("confirmPassword", errors.confirmPassword?.message)}
          {...register("confirmPassword")}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={!hydrated || isSubmitting}>
        {isSubmitting ? "Enregistrement…" : "Enregistrer le mot de passe"}
      </Button>
    </form>
  );
}
