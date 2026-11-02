"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@yamboka/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { apiPost, applyApiError } from "@/lib/api-client";
import { useHydrated } from "@/lib/use-hydrated";
import { Field, describedBy } from "./field";
import { SubmitButton } from "./submit-button";

export function ForgotForm() {
  const hydrated = useHydrated();
  const [done, setDone] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const res = await apiPost<{ message: string }>("/auth/forgot-password", values);
      setDone(res.message);
    } catch (e) {
      setFormError(applyApiError(e, setError, ["email"]));
    }
  });

  if (done) {
    return (
      <Alert role="status">
        <AlertDescription>{done} Pensez à vérifier vos courriers indésirables.</AlertDescription>
      </Alert>
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
      <SubmitButton disabled={!hydrated} loading={isSubmitting} loadingLabel="Envoi…">
        Envoyer le lien
      </SubmitButton>
    </form>
  );
}
