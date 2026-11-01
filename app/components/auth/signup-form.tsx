"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema } from "@yamboka/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import type { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { apiPost, applyApiError } from "@/lib/api-client";
import { useHydrated } from "@/lib/use-hydrated";
import { SITE_URL } from "@/lib/site";
import { Field, describedBy } from "./field";
import { PasswordInput } from "./password-input";
import { SubmitButton } from "./submit-button";

/** Le schéma partagé exige `acceptLegal: true` ; la case démarre décochée, d'où ce type de formulaire élargi. */
type SignupFormValues = Omit<z.input<typeof signupSchema>, "acceptLegal"> & { acceptLegal: boolean };

const FIELDS = ["firstName", "lastName", "email", "phone", "password", "confirmPassword", "acceptLegal"] as const;

export function SignupForm() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({
    // Le résolveur valide avec le schéma partagé ; la conversion n'élargit que le type de la case à cocher.
    resolver: zodResolver(signupSchema) as unknown as Resolver<SignupFormValues>,
    // Seule la case à cocher a une valeur par défaut : les champs texte ne doivent pas écraser une saisie
    // faite avant l'hydratation.
    defaultValues: { acceptLegal: false },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const res = await apiPost<{ emailSent: boolean }>("/auth/register", values);
      // Compte créé et connecté : on enchaîne sur la saisie du code reçu par e-mail.
      router.replace(res.emailSent ? "/verifier-email" : "/verifier-email?envoi=echec");
      router.refresh();
    } catch (e) {
      setFormError(applyApiError(e, setError, FIELDS));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-3 sm:gap-5">
        <Field id="firstName" label="Prénom" error={errors.firstName?.message}>
          <Input
            id="firstName"
            autoComplete="given-name"
            aria-invalid={!!errors.firstName}
            aria-describedby={describedBy("firstName", errors.firstName?.message)}
            {...register("firstName")}
          />
        </Field>
        <Field id="lastName" label="Nom" error={errors.lastName?.message}>
          <Input
            id="lastName"
            autoComplete="family-name"
            aria-invalid={!!errors.lastName}
            aria-describedby={describedBy("lastName", errors.lastName?.message)}
            {...register("lastName")}
          />
        </Field>
      </div>
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
      <Field
        id="phone"
        label="Téléphone (facultatif)"
        hint="Choisissez votre pays. Il servira à préremplir vos paiements mobile money."
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
              aria-invalid={!!errors.phone}
              aria-describedby={describedBy("phone", errors.phone?.message, "hint")}
            />
          )}
        />
      </Field>
      <Field id="password" label="Mot de passe" hint="8 caractères minimum." error={errors.password?.message}>
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

      <div className="space-y-1.5">
        <div className="flex items-start gap-3">
          <Controller
            control={control}
            name="acceptLegal"
            render={({ field }) => (
              <Checkbox
                id="acceptLegal"
                checked={field.value}
                onCheckedChange={(v) => field.onChange(v === true)}
                onBlur={field.onBlur}
                ref={field.ref}
                aria-invalid={!!errors.acceptLegal}
                aria-describedby={describedBy("acceptLegal", errors.acceptLegal?.message)}
                className="mt-0.5 size-5"
              />
            )}
          />
          <label htmlFor="acceptLegal" className="text-sm leading-snug">
            J’accepte les{" "}
            <a href={`${SITE_URL}/conditions-utilisation`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4">
              conditions d’utilisation
            </a>{" "}
            et la{" "}
            <a href={`${SITE_URL}/charte-utilisation`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4">
              charte d’utilisation
            </a>
            .
          </label>
        </div>
        {errors.acceptLegal && (
          <p id="acceptLegal-error" role="alert" className="text-sm font-medium text-destructive">
            {errors.acceptLegal.message}
          </p>
        )}
      </div>

      <SubmitButton disabled={!hydrated} loading={isSubmitting} loadingLabel="Création du compte…">
        Créer mon compte
      </SubmitButton>
    </form>
  );
}
