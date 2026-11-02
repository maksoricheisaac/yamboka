"use client";

import { Fragment, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { ApiError } from "@/lib/api-client";
import { Field } from "./field";

export interface OtpIssuedInfo {
  resendInSeconds: number;
  expiresInMinutes: number;
}

/**
 * Saisie d'un code à usage unique reçu par e-mail. Réutilisé par la vérification d'adresse et par la confirmation
 * de connexion. Le compte à rebours bloque le bouton « Renvoyer » (le serveur applique de toute façon le délai).
 */
export function OtpForm({
  email,
  initialCooldown,
  codeLength = 6,
  ttlMinutes = 10,
  notSentNotice,
  onVerify,
  onResend,
  onChangeEmail,
}: {
  email: string;
  /** Secondes restantes avant de pouvoir renvoyer (0 : tout de suite, par exemple si le premier envoi a échoué). */
  initialCooldown: number;
  /** Nombre de chiffres du code et sa durée de validité : valeurs réelles de l'API (EMAIL_OTP_LENGTH, EMAIL_OTP_TTL_MINUTES). */
  codeLength?: number;
  ttlMinutes?: number;
  /** Affiché quand le premier envoi a échoué : on ne prétend jamais qu'un code est parti. */
  notSentNotice?: string;
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<OtpIssuedInfo>;
  onChangeEmail?: () => void;
}) {
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(initialCooldown);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<"verify" | "resend" | null>(null);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== codeLength) {
      setError(`Saisissez les ${codeLength} chiffres du code reçu par e-mail.`);
      return;
    }
    setError(null);
    setInfo(null);
    setBusy("verify");
    try {
      await onVerify(code);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue. Veuillez réessayer.");
      setCode("");
      setBusy(null);
    }
  }

  async function resend() {
    setError(null);
    setInfo(null);
    setBusy("resend");
    try {
      const res = await onResend();
      setSeconds(res.resendInSeconds);
      setInfo(`Un nouveau code vient d’être envoyé à ${email}. Il est valable ${res.expiresInMinutes} minutes.`);
    } catch (err) {
      if (err instanceof ApiError && typeof err.info.retryAfterSeconds === "number") {
        setSeconds(err.info.retryAfterSeconds);
      }
      setError(err instanceof ApiError ? err.message : "Envoi impossible pour le moment.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {notSentNotice && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{notSentNotice}</AlertDescription>
        </Alert>
      )}
      <p className="text-sm text-muted-foreground">
        {notSentNotice ? "Adresse :" : "Un code à usage unique a été envoyé à"} <strong className="text-foreground">{email}</strong>.
        {onChangeEmail && (
          <>
            {" "}
            <button type="button" onClick={onChangeEmail} className="font-medium text-primary underline underline-offset-4">
              Corriger l’adresse
            </button>
          </>
        )}
      </p>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {info && (
        <Alert role="status">
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      )}
      <Field id="otp" label="Code de vérification" hint={`Saisissez le code à ${codeLength} chiffres. Il est valable ${ttlMinutes} minutes.`}>
        <InputOTP
          id="otp"
          maxLength={codeLength}
          value={code}
          onChange={setCode}
          inputMode="numeric"
          pattern="^[0-9]*$"
          autoComplete="one-time-code"
          aria-describedby="otp-hint"
          containerClassName="justify-center"
        >
          {Array.from({ length: Math.ceil(codeLength / 2) }, (_, g) => (
            <Fragment key={g}>
              {g > 0 && <InputOTPSeparator />}
              <InputOTPGroup>
                {[g * 2, g * 2 + 1].filter((i) => i < codeLength).map((i) => (
                  <InputOTPSlot key={i} index={i} className="size-12 text-xl" />
                ))}
              </InputOTPGroup>
            </Fragment>
          ))}
        </InputOTP>
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={busy !== null || code.length < codeLength}>
        {busy === "verify" ? "Vérification…" : "Valider le code"}
      </Button>
      <div className="text-center">
        <Button type="button" variant="ghost" onClick={resend} disabled={seconds > 0 || busy !== null}>
          {busy === "resend" ? "Envoi…" : seconds > 0 ? `Renvoyer le code dans ${seconds} s` : "Renvoyer le code"}
        </Button>
      </div>
    </form>
  );
}
