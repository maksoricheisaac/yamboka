"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { changePasswordSchema, updateProfileSchema, type ChangePasswordInput, type SessionUser } from "@yamboka/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Field, describedBy } from "@/components/auth/field";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { apiPatch, apiPost, applyApiError } from "@/lib/api-client";
import { useHydrated } from "@/lib/use-hydrated";

interface IdentityValues {
  firstName: string;
  lastName: string;
  phone?: string;
}

function IdentityForm({ user }: { user: SessionUser }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<IdentityValues>({
    resolver: zodResolver(updateProfileSchema) as never,
    defaultValues: { firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setMessage(null);
    try {
      await apiPatch("/me", values);
      setMessage({ ok: true, text: "Profil enregistré." });
      router.refresh();
    } catch (e) {
      const general = applyApiError(e, setError, ["firstName", "lastName", "phone"]);
      if (general) setMessage({ ok: false, text: general });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="firstName" label="Prénom" error={errors.firstName?.message}>
          <Input id="firstName" autoComplete="given-name" aria-invalid={!!errors.firstName} aria-describedby={describedBy("firstName", errors.firstName?.message)} {...register("firstName")} />
        </Field>
        <Field id="lastName" label="Nom" error={errors.lastName?.message}>
          <Input id="lastName" autoComplete="family-name" aria-invalid={!!errors.lastName} aria-describedby={describedBy("lastName", errors.lastName?.message)} {...register("lastName")} />
        </Field>
      </div>
      <Field id="email" label="Adresse e-mail" hint="L’adresse ne peut pas être modifiée une fois confirmée.">
        <Input id="email" value={user.email} readOnly aria-describedby="email-hint" className="bg-muted" />
      </Field>
      <Field id="phone" label="Numéro de téléphone (facultatif)" hint="Choisissez votre pays, puis saisissez le numéro. Il préremplit vos paiements mobile money." error={errors.phone?.message}>
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <PhoneInput id="phone" name={field.name} value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} aria-invalid={!!errors.phone} aria-describedby={describedBy("phone", errors.phone?.message, "hint")} />
          )}
        />
      </Field>
      {message && (
        <Alert variant={message.ok ? "default" : "destructive"} role={message.ok ? "status" : "alert"}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={!hydrated || isSubmitting}>
        {isSubmitting ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}

function PasswordForm() {
  const hydrated = useHydrated();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setMessage(null);
    try {
      await apiPost("/me/password", values);
      reset();
      setMessage({ ok: true, text: "Mot de passe modifié. Vos autres appareils ont été déconnectés." });
    } catch (e) {
      const general = applyApiError(e, setError, ["currentPassword", "newPassword", "confirmPassword"]);
      if (general) setMessage({ ok: false, text: general });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <Field id="currentPassword" label="Mot de passe actuel" error={errors.currentPassword?.message}>
        <PasswordInput id="currentPassword" autoComplete="current-password" aria-invalid={!!errors.currentPassword} aria-describedby={describedBy("currentPassword", errors.currentPassword?.message)} {...register("currentPassword")} />
      </Field>
      <Field id="newPassword" label="Nouveau mot de passe" error={errors.newPassword?.message}>
        <PasswordInput id="newPassword" autoComplete="new-password" aria-invalid={!!errors.newPassword} aria-describedby={describedBy("newPassword", errors.newPassword?.message)} {...register("newPassword")} />
      </Field>
      <Field id="confirmPassword" label="Confirmer le nouveau mot de passe" error={errors.confirmPassword?.message}>
        <PasswordInput id="confirmPassword" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} aria-describedby={describedBy("confirmPassword", errors.confirmPassword?.message)} {...register("confirmPassword")} />
      </Field>
      {message && (
        <Alert variant={message.ok ? "default" : "destructive"} role={message.ok ? "status" : "alert"}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" variant="outline" disabled={!hydrated || isSubmitting}>
        {isSubmitting ? "Modification…" : "Changer le mot de passe"}
      </Button>
    </form>
  );
}

/** Profil : identité et mot de passe (réutilisé par l'espace client et par l'administration). */
export function ProfileForms({ user }: { user: SessionUser }) {
  return (
    <div className="max-w-2xl space-y-10">
      <section aria-labelledby="identite" className="space-y-4">
        <h2 id="identite" className="text-xl font-bold">Informations personnelles</h2>
        <IdentityForm user={user} />
      </section>
      <section aria-labelledby="securite" className="space-y-4 border-t pt-8">
        <h2 id="securite" className="text-xl font-bold">Mot de passe</h2>
        {user.hasPassword ? (
          <PasswordForm />
        ) : (
          <p className="text-sm text-muted-foreground">Votre compte utilise la connexion avec Google : il n’a pas de mot de passe.</p>
        )}
      </section>
    </div>
  );
}
