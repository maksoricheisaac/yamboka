"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { REPORT_REASONS, type CreationView } from "@yamboka/shared";
import { Flag, Loader2, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { ApiError, apiDelete, apiGet, apiPost } from "@/lib/api-client";
import { KINDS, credits, isRunning, mediaUrl, ratioOf } from "@/lib/creations";
import { formatDateTime } from "@/lib/format";
import { CreationMedia } from "./creation-media";
import { ResultActions } from "./result-actions";
import { StatusPill } from "./status-pill";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

export function CreationDetail({ initial }: { initial: CreationView }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: c } = useQuery({
    queryKey: ["creation", initial.id],
    queryFn: async () => (await apiGet<{ creation: CreationView }>(`/creations/${initial.id}`)).creation,
    initialData: initial,
    refetchInterval: (q) => (q.state.data && isRunning(q.state.data) ? 3000 : false),
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [reporting, setReporting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const Icon = KINDS[c.kind].icon;
  const poster = mediaUrl(c.thumbnailUrl);

  async function remove() {
    setDeleting(true);
    setDialogError(null);
    try {
      await apiDelete(`/creations/${c.id}`);
      void queryClient.invalidateQueries({ queryKey: ["creations"] });
      toast.success("Création supprimée.");
      router.push("/app/creations");
    } catch (e) {
      setDialogError(e instanceof ApiError ? e.message : "Suppression impossible. Réessayez.");
      setDeleting(false);
    }
  }

  async function report() {
    if (!reason) return setDialogError("Choisissez un motif.");
    setReporting(true);
    setDialogError(null);
    try {
      await apiPost(`/creations/${c.id}/report`, { reason, ...(details.trim() ? { details: details.trim() } : {}) });
      setReportOpen(false);
      setReason("");
      setDetails("");
      toast.success("Merci : votre signalement a été transmis à l’équipe.");
    } catch (e) {
      setDialogError(e instanceof ApiError ? e.message : "Envoi impossible. Réessayez.");
    } finally {
      setReporting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div className="rounded-3xl border bg-card p-4 shadow-soft sm:p-6">
        {c.status === "COMPLETED" && <CreationMedia creation={c} />}

        {isRunning(c) && (
          <figure className="mx-auto w-full max-w-[18rem]">
            <div className="relative grid place-content-center justify-items-center gap-3 overflow-hidden rounded-3xl border bg-foreground/90 p-6 text-center text-white" style={{ aspectRatio: ratioOf(c.options.format) }}>
              {poster && (
                // eslint-disable-next-line @next/next/no-img-element -- fichier privé servi par l'API
                <img src={poster} alt="" className="absolute inset-0 size-full scale-105 object-cover opacity-40 blur-md" />
              )}
              <div className="relative space-y-3" role="status">
                <Loader2 className="mx-auto size-10 animate-spin motion-reduce:animate-none" aria-hidden />
                <p className="font-heading text-xl font-bold">Création en cours…</p>
                <p className="text-sm text-white/85">En général 1 à 2 minutes.</p>
              </div>
            </div>
          </figure>
        )}

        {c.status === "FAILED" && (
          <div className="grid place-items-center gap-3 py-16 text-center">
            <TriangleAlert className="size-10 text-destructive" aria-hidden />
            <p className="font-heading text-xl font-bold">La création n’a pas abouti</p>
            <Alert role="status" className="max-w-md border-success/40 bg-success/10 text-left">
              <ShieldCheck className="size-4 text-success" aria-hidden />
              <AlertDescription>Vos {credits(c.credits)} ont été restitués. Vous pouvez relancer la création.</AlertDescription>
            </Alert>
          </div>
        )}
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
            <Icon className="size-4" aria-hidden /> {KINDS[c.kind].label}
          </p>
          <h1 className="text-3xl font-bold">{c.styleName}</h1>
          <StatusPill creation={c} />
        </div>

        {c.status === "COMPLETED" && <ResultActions creation={c} />}
        {c.status === "FAILED" && (
          <Button asChild size="lg" className="h-12 w-full">
            <Link href={`/app/creer?${new URLSearchParams({ type: c.kind, ...(c.styleId ? { style: c.styleId } : {}), ...(c.prompt ? { prompt: c.prompt } : {}) })}`}>Réessayer</Link>
          </Button>
        )}

        {c.prompt && (
          <section aria-labelledby="prompt-label" className="space-y-1.5">
            <h2 id="prompt-label" className="text-sm font-semibold text-muted-foreground">Votre description</h2>
            <p className="whitespace-pre-wrap rounded-2xl border bg-card p-4 text-sm leading-relaxed">{c.prompt}</p>
          </section>
        )}

        <dl className="divide-y rounded-2xl border bg-card px-4">
          <Row label="Créée le">{formatDateTime(c.createdAt)}</Row>
          <Row label="Coût">{credits(c.credits)}</Row>
          <Row label="Format">{c.options.format}</Row>
          {c.expiresAt && c.status === "COMPLETED" && <Row label="Conservée jusqu’au">{formatDateTime(c.expiresAt).split(" à ")[0]}</Row>}
        </dl>

        <div className="flex flex-wrap gap-2">
          {c.status === "COMPLETED" && (
            <Button type="button" variant="outline" onClick={() => { setDialogError(null); setReportOpen(true); }}>
              <Flag aria-hidden /> Signaler
            </Button>
          )}
          {!isRunning(c) && (
            <Button type="button" variant="destructive" onClick={() => { setDialogError(null); setDeleteOpen(true); }}>
              <Trash2 aria-hidden /> Supprimer
            </Button>
          )}
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={(o) => !deleting && setDeleteOpen(o)}>
        <DialogContent>
          <DialogTitle>Supprimer cette création ?</DialogTitle>
          <DialogDescription>Le fichier sera supprimé définitivement. Les crédits utilisés ne sont pas restitués.</DialogDescription>
          {dialogError && <p role="alert" className="text-sm font-medium text-destructive">{dialogError}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="outline" disabled={deleting}>Annuler</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => void remove()} disabled={deleting}>
              {deleting && <Loader2 className="animate-spin" aria-hidden />} Supprimer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reportOpen} onOpenChange={(o) => !reporting && setReportOpen(o)}>
        <DialogContent>
          <DialogTitle>Signaler ce contenu</DialogTitle>
          <DialogDescription>Dites-nous ce qui pose problème. L’équipe Yamboka examinera la création.</DialogDescription>
          <fieldset className="space-y-2">
            <legend className="sr-only">Motif du signalement</legend>
            {REPORT_REASONS.map((r) => (
              <label key={r} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 has-[:checked]:border-primary has-[:checked]:bg-primary/8">
                <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="size-4 accent-[var(--primary)]" />
                <span className="text-sm font-medium">{r}</span>
              </label>
            ))}
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="report-details">Précisions (facultatif)</Label>
            <Textarea id="report-details" value={details} maxLength={500} onChange={(e) => setDetails(e.target.value)} rows={3} />
          </div>
          {dialogError && <p role="alert" className="text-sm font-medium text-destructive">{dialogError}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="outline" disabled={reporting}>Annuler</Button>
            </DialogClose>
            <Button onClick={() => void report()} disabled={reporting}>
              {reporting && <Loader2 className="animate-spin" aria-hidden />} Envoyer le signalement
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
