"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { ApiError, apiPatch, apiPost } from "@/lib/api-client";

export type ActionField =
  | { name: string; label: string; type: "text" | "number" | "date"; defaultValue?: string | number; hint?: string; required?: boolean }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[]; defaultValue?: string; hint?: string }
  | { name: string; label: string; type: "textarea"; defaultValue?: string; hint?: string; required?: boolean };

export interface ActionDialogProps {
  /** Bouton d'ouverture. Absent quand le dialogue est piloté de l'extérieur (menu d'actions : `open` + `onOpenChange`). */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  endpoint: string;
  method?: "POST" | "PATCH";
  fields?: ActionField[];
  /** Valeurs envoyées telles quelles avec le formulaire (ex. { action: "SUSPEND" }). */
  fixed?: Record<string, string | number | boolean>;
  withReason?: boolean;
  reasonLabel?: string;
  submitLabel?: string;
  destructive?: boolean;
  triggerVariant?: "default" | "outline" | "ghost" | "destructive" | "secondary";
  triggerSize?: "sm" | "default" | "xs";
  /** Nom accessible du bouton quand le libellé seul est ambigu (plusieurs « Masquer » dans un tableau). */
  triggerLabel?: string;
  successMessage?: string;
  children?: ReactNode;
}

/**
 * Dialogue d'action d'administration : champs, motif obligatoire (consigné au journal d'audit) et envoi à l'API.
 * Les props sont sérialisables : on peut l'utiliser depuis un composant serveur. L'API revérifie tout (rôle, motif,
 * règles métier) ; ce dialogue n'est qu'une commodité, jamais une protection.
 */
export function ActionDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  title,
  description,
  endpoint,
  method = "POST",
  fields = [],
  fixed = {},
  withReason = true,
  reasonLabel = "Motif (conservé dans le journal d’audit)",
  submitLabel = "Confirmer",
  destructive = false,
  triggerVariant = "outline",
  triggerSize = "sm",
  triggerLabel,
  successMessage,
  children,
}: ActionDialogProps) {
  const router = useRouter();
  const uid = useId();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = (v: boolean) => {
    setInnerOpen(v);
    onOpenChange?.(v);
  };
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { ...fixed };
    for (const f of fields) {
      const raw = String(form.get(f.name) ?? "").trim();
      if (raw === "") continue;
      body[f.name] = f.type === "number" ? Number(raw.replace(",", ".")) : f.type === "select" && (raw === "true" || raw === "false") ? raw === "true" : raw;
    }
    if (withReason) body.reason = String(form.get("reason") ?? "").trim();

    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await (method === "PATCH" ? apiPatch : apiPost)(endpoint, body);
      setOpen(false);
      toast.success(successMessage ?? "Modification enregistrée.");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const mapped: Record<string, string> = {};
        for (const d of err.details) mapped[d.field] = d.message;
        setFieldErrors(mapped);
        setError(Object.keys(mapped).length ? "Corrigez les champs signalés." : err.message);
      } else {
        setError("Une erreur est survenue. Veuillez réessayer.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setError(null); setFieldErrors({}); } }}>
      {trigger && (
        <DialogTrigger asChild>
          <Button variant={triggerVariant} size={triggerSize} type="button" aria-label={triggerLabel}>
            {trigger}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <div className="space-y-1">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? "Cette action est enregistrée dans le journal d’audit."}</DialogDescription>
        </div>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {children}
          {fields.map((f) => {
            const id = `${uid}-${f.name}`;
            const err = fieldErrors[f.name];
            return (
              <div key={f.name} className="space-y-1.5">
                <Label htmlFor={id}>{f.label}</Label>
                {f.type === "textarea" ? (
                  <Textarea id={id} name={f.name} defaultValue={f.defaultValue} aria-invalid={!!err} />
                ) : f.type === "select" ? (
                  <select id={id} name={f.name} defaultValue={f.defaultValue} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : (
                  <Input id={id} name={f.name} type={f.type === "number" ? "text" : f.type} inputMode={f.type === "number" ? "decimal" : undefined} defaultValue={f.defaultValue} aria-invalid={!!err} />
                )}
                {f.hint && !err && <p className="text-xs text-muted-foreground">{f.hint}</p>}
                {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
              </div>
            );
          })}
          {withReason && (
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-reason`}>{reasonLabel}</Label>
              <Textarea id={`${uid}-reason`} name="reason" required minLength={5} aria-invalid={!!fieldErrors.reason} placeholder="Au moins 5 caractères" />
              {fieldErrors.reason && <p role="alert" className="text-sm font-medium text-destructive">{fieldErrors.reason}</p>}
            </div>
          )}
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">Annuler</Button>
            </DialogClose>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={busy}>
              {busy ? "Envoi…" : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
