"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_FORMAT,
  DEFAULT_RESOLUTION,
  MAX_PROMPT_LENGTH,
  RESOLUTION_LABELS,
  VIDEO_DURATION,
  VIDEO_RESOLUTIONS,
  isValidDuration,
  needsConfirmation,
  videoCostCredits,
  type CreationConfig,
  type CreationFormat,
  type CreationView,
  type StyleView,
  type VideoResolution,
} from "@yamboka/shared";
import { ArrowUp, Check, Clock, Coins, Loader2, Pencil, Plus, ShieldCheck, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ApiError, apiGet, apiUpload } from "@/lib/api-client";
import { FORMATS, PROMPT_HINT, compressPhoto, credits, isRunning, ratioValue } from "@/lib/creations";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CreationMedia } from "./creation-media";
import { CreationPreview } from "./creation-preview";
import { ResultActions } from "./result-actions";

interface StudioProps {
  styles: StyleView[];
  /** Tarifs par résolution et garde-fou, lus côté serveur. */
  config: CreationConfig;
  balance: number;
  emailVerified: boolean;
  /** Idée demandée depuis « Idées » : remplit le texte et les réglages par défaut (tous modifiables). */
  initialStyleId: string | null;
  initialPrompt: string;
}

type FieldErrors = Partial<Record<"photo" | "prompt" | "consent" | "duration", string>>;

/** Un pictogramme à la proportion exacte du format : on comprend sans lire. */
function RatioGlyph({ format }: { format: CreationFormat }) {
  const r = ratioValue(format);
  const box = 28; // le grand côté du pictogramme, en pixels
  const width = r >= 1 ? box : Math.round(box * r);
  const height = r >= 1 ? Math.round(box / r) : box;
  return <span aria-hidden className="block rounded-[3px] border-2 border-current" style={{ width, height }} />;
}

/** Pastille de réglage : un bouton discret qui ouvre un petit panneau (format, qualité, durée). */
function Chip({ icon, label, title, disabled, children }: { icon: React.ReactNode; label: string; title: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${title} : ${label}. Modifier`}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-background px-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-60"
        >
          {icon}
          <span>{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        <p className="text-sm font-semibold">{title}</p>
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function Studio({ styles, config, balance, emailVerified, initialStyleId, initialPrompt }: StudioProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const initialStyle = styles.find((s) => s.id === initialStyleId) ?? null;
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(initialPrompt || initialStyle?.prompt || "");
  const [format, setFormat] = useState<CreationFormat>(initialStyle?.format ?? DEFAULT_FORMAT);
  const [resolution, setResolution] = useState<VideoResolution>(initialStyle?.resolution ?? DEFAULT_RESOLUTION);
  const [duration, setDuration] = useState<number>(initialStyle?.durationSeconds ?? VIDEO_DURATION.default);
  // Consentement unique (RG-31), demandé à l'étape de confirmation et enregistré avec son horodatage par le serveur.
  const [confirming, setConfirming] = useState(false);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [creationId, setCreationId] = useState<string | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  const urlRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Aperçu local de la photo : l'URL temporaire est libérée quand on change de photo et à la fermeture de la page.
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  function pickPhoto(file: File) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(file);
    setPhoto(file);
    setPhotoUrl(urlRef.current);
    setErrors((e) => ({ ...e, photo: undefined }));
  }

  function clearPhoto() {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPhoto(null);
    setPhotoUrl(null);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      pickPhoto(await compressPhoto(file));
    } catch (e) {
      setErrors((x) => ({ ...x, photo: e instanceof Error ? e.message : "Photo illisible." }));
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  // L'idée éventuelle vient de « Idées » ou « Refaire » (adresse) : elle préremplit le formulaire, sans liste de suggestions ici.
  const idea = initialStyle;
  const durationOk = isValidDuration(duration);
  // Le serveur recalcule ce coût : l'affichage et le débit utilisent la même fonction.
  const cost = durationOk ? videoCostCredits(config.rates, resolution, duration) : 0;
  const after = balance - cost;
  const enough = after >= 0;
  const mustConfirm = durationOk && needsConfirmation(cost, balance, config.guard);
  const tracking = creationId !== null;

  const { data: creation } = useQuery({
    queryKey: ["creation", creationId],
    enabled: tracking,
    queryFn: async () => (await apiGet<{ creation: CreationView }>(`/creations/${creationId}`)).creation,
    refetchInterval: (q) => (q.state.data && !isRunning(q.state.data) ? false : 2500),
  });

  // Dès que la création se termine (prête ou échec remboursé) : solde de l'en-tête et galerie à jour.
  const finished = creation && !isRunning(creation) ? creation.status : null;
  useEffect(() => {
    if (!finished) return;
    void queryClient.invalidateQueries({ queryKey: ["creations"] });
    router.refresh();
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [finished, queryClient, router]);

  function validate(): FieldErrors {
    const e: FieldErrors = {};
    if (!photo) e.photo = "Ajoutez votre photo.";
    if (!prompt.trim()) e.prompt = "Décrivez votre vidéo en quelques mots.";
    if (!durationOk) e.duration = `La durée doit être comprise entre ${VIDEO_DURATION.min} et ${VIDEO_DURATION.max} secondes.`;
    return e;
  }

  /** Étape 1 : vérifier le formulaire, puis demander la confirmation (coût et consentement). */
  function review() {
    setFormError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setConsent(false);
    setConfirming(true);
  }

  /** Étape 2 : le client a confirmé ; la création est envoyée. */
  async function submit() {
    if (!photo || !consent) return;
    setSending(true);
    try {
      const form = new FormData();
      form.set("photo", photo, "photo.jpg");
      if (idea) form.set("styleId", idea.id);
      form.set("format", format);
      form.set("resolution", resolution);
      form.set("durationSeconds", String(duration));
      form.set("consent", "true");
      form.set("prompt", prompt.trim());
      const { creation: created } = await apiUpload<{ creation: CreationView }>("/creations", form);
      queryClient.setQueryData(["creation", created.id], created);
      setCreationId(created.id);
      router.refresh(); // le solde de l'en-tête reflète tout de suite la réservation
    } catch (err) {
      setConfirming(false);
      if (err instanceof ApiError && err.details.length > 0) {
        const next: FieldErrors = {};
        for (const d of err.details) {
          if (d.field === "prompt") next.prompt = d.message;
          else if (d.field === "durationSeconds") next.duration = d.message;
        }
        setErrors(next);
        if (Object.keys(next).length === 0) setFormError(err.message);
      } else {
        setFormError(err instanceof ApiError ? err.message : "Une erreur est survenue. Veuillez réessayer.");
      }
    } finally {
      setSending(false);
      setConfirming(false);
    }
  }

  function editAgain() {
    setCreationId(null);
    setFormError(null);
  }

  const canSubmit = emailVerified && !sending && durationOk && enough;
  const formatLabel = FORMATS.find((f) => f.value === format)?.label ?? format;
  const showPreview = tracking;
  const anyError = errors.photo ?? errors.prompt ?? errors.duration ?? formError;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      {/* ───────── Composeur : tout se fait ici, comme dans un chat ───────── */}
      {!tracking && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            review();
          }}
          className="space-y-3"
        >
          <div className="rounded-3xl bg-card shadow-card p-3 shadow-soft transition-shadow focus-within:shadow-md focus-within:ring-2 focus-within:ring-ring/30">
            {photoUrl && (
              <div className="mb-2 flex items-center gap-2">
                <span className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob) */}
                  <img src={photoUrl} alt="Photo choisie" className="size-16 rounded-xl border object-cover" />
                  <button
                    type="button"
                    onClick={clearPhoto}
                    aria-label="Retirer la photo"
                    className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full border bg-background shadow-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </span>
              </div>
            )}
            <label htmlFor="creation-prompt" className="sr-only">Décrivez votre vidéo</label>
            <textarea
              id="creation-prompt"
              value={prompt}
              maxLength={MAX_PROMPT_LENGTH}
              rows={3}
              placeholder={photo ? "Que doit-il se passer dans la vidéo ?" : PROMPT_HINT}
              aria-invalid={!!errors.prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setErrors((x) => ({ ...x, prompt: undefined }));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  review();
                }
              }}
              className="max-h-64 min-h-20 w-full resize-none bg-transparent px-2 py-1.5 text-base leading-relaxed outline-none placeholder:text-muted-foreground"
            />

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" className="sr-only" id="creation-photo" onChange={(e) => void onFile(e.target.files?.[0])} />
              <label
                htmlFor="creation-photo"
                className={cn(
                  "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-medium outline-none transition-colors hover:bg-muted focus-within:ring-3 focus-within:ring-ring/60",
                  !photo && "border-primary/50 text-primary",
                )}
              >
                <Plus className="size-4" aria-hidden /> {photo ? "Changer" : "Photo"}
              </label>

              <Chip title="Format" label={formatLabel} icon={<RatioGlyph format={format} />}>
                <div role="radiogroup" aria-label="Format" className="grid grid-cols-5 gap-1.5">
                  {FORMATS.map((f) => (
                    <label key={f.value} className="cursor-pointer" title={f.where}>
                      <input type="radio" name="format" value={f.value} checked={format === f.value} onChange={() => setFormat(f.value)} className="peer sr-only" />
                      <span className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2 text-muted-foreground peer-checked:border-primary peer-checked:bg-primary/8 peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                        <RatioGlyph format={f.value} />
                        <span className="text-[0.7rem] leading-none">{f.value}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{FORMATS.find((f) => f.value === format)?.where}</p>
              </Chip>

              <Chip title="Qualité" label={RESOLUTION_LABELS[resolution]} icon={<Check className="size-3.5 text-primary" aria-hidden />}>
                <div role="radiogroup" aria-label="Qualité" className="grid gap-1.5">
                  {VIDEO_RESOLUTIONS.map((r) => (
                    <label key={r} className="cursor-pointer">
                      <input type="radio" name="resolution" value={r} checked={resolution === r} onChange={() => setResolution(r)} className="peer sr-only" />
                      <span className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm peer-checked:border-primary peer-checked:bg-primary/8 peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                        <span className="font-medium">{RESOLUTION_LABELS[r]} <span className="font-normal text-muted-foreground">· {r}</span></span>
                        <span className="text-xs text-primary">{credits(config.rates[r])} / s</span>
                      </span>
                    </label>
                  ))}
                </div>
              </Chip>

              <Chip title="Durée" label={`${duration} s`} icon={<Clock className="size-3.5" aria-hidden />}>
                <input
                  type="range"
                  aria-label="Durée en secondes"
                  min={VIDEO_DURATION.min}
                  max={VIDEO_DURATION.max}
                  step={1}
                  value={duration}
                  onChange={(e) => {
                    setDuration(Number(e.target.value));
                    setErrors((x) => ({ ...x, duration: undefined }));
                  }}
                  className="h-6 w-full cursor-pointer accent-primary"
                />
                <p className="flex justify-between text-xs text-muted-foreground">
                  <span>{VIDEO_DURATION.min} s</span>
                  <span className="font-semibold text-foreground">{duration} s</span>
                  <span>{VIDEO_DURATION.max} s</span>
                </p>
              </Chip>

              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm tabular-nums text-muted-foreground" aria-live="polite">{credits(cost)}</span>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  aria-label={`Générer la vidéo, ${credits(cost)}`}
                  className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground outline-none transition-opacity focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-40"
                >
                  {sending ? <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden /> : <ArrowUp className="size-5" aria-hidden />}
                </button>
              </div>
            </div>
          </div>

          {idea?.photoHint && <p className="px-1 text-sm text-muted-foreground">Conseil photo : {idea.photoHint}</p>}

          {/* Confirmations et messages, discrets */}
          <div className="space-y-2 px-1">
            {!emailVerified && (
              <Alert className="border-accent bg-accent/15" role="status">
                <AlertDescription>
                  Confirmez d’abord votre adresse e-mail pour lancer une création. <Link href="/verifier-email" className="font-medium underline">Confirmer</Link>
                </AlertDescription>
              </Alert>
            )}
            {emailVerified && !enough && (
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium" role="status">
                <Coins className="size-4 text-primary" aria-hidden />
                Il vous manque {credits(-after)} pour cette vidéo.
                <Link href="/app/credits" className="text-primary underline underline-offset-4">Recharger mes crédits</Link>
              </p>
            )}
            {anyError && (
              <p role="alert" className="text-sm font-medium text-destructive">{anyError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Solde : {formatNumber(balance)} {balance > 1 ? "crédits" : "crédit"} · Crédits restitués si la création échoue.
            </p>
          </div>

          <Dialog open={confirming} onOpenChange={(o) => { if (!sending) setConfirming(o); }}>
            <DialogContent className="max-w-md">
              <DialogTitle>Lancer la création ?</DialogTitle>
              <DialogDescription>
                Cette vidéo coûte <strong className="text-foreground">{credits(cost)}</strong>. Il vous restera {credits(Math.max(after, 0))}.
                {mustConfirm && " C’est une part importante de votre solde."}
              </DialogDescription>
              <div className="flex items-start gap-2.5">
                <Checkbox id="creation-consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5 size-5" />
                <Label htmlFor="creation-consent" className="cursor-pointer text-sm font-normal leading-snug">
                  Je confirme avoir le droit d’utiliser cette photo et que son contenu respecte la charte d’utilisation de Yamboka.
                </Label>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={sending}>Modifier</Button>
                </DialogClose>
                <Button type="button" disabled={!consent || sending} onClick={() => void submit()}>
                  {sending && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
                  Lancer · {credits(cost)}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </form>
      )}

      {/* ───────── Attente et résultat ───────── */}
      {showPreview && (
        <section ref={resultRef} aria-label="Votre vidéo" className="min-w-0 space-y-4">
          {creation && isRunning(creation) && (
            <CreationPreview format={format} photoUrl={photoUrl} caption=" ">
              <div role="status" className="absolute inset-0 grid place-content-center justify-items-center gap-3 bg-black/55 p-4 text-center text-white backdrop-blur-sm">
                <span aria-hidden className="size-10 animate-spin rounded-full border-4 border-white/25 border-t-accent motion-reduce:animate-none" />
                <div>
                  <p className="font-heading text-base font-bold">Création en cours…</p>
                  <p className="mt-0.5 text-xs text-white/80">En général 1 à 2 minutes.</p>
                </div>
              </div>
            </CreationPreview>
          )}

          {creation?.status === "COMPLETED" && <CreationMedia creation={creation} />}

          {creation?.status === "FAILED" && (
            <CreationPreview format={format} photoUrl={photoUrl} caption=" ">
              <div className="absolute inset-0 grid place-content-center justify-items-center gap-2 bg-black/65 p-4 text-center text-white">
                <TriangleAlert className="size-8 text-accent" aria-hidden />
                <p className="font-heading text-base font-bold">La création n’a pas abouti</p>
              </div>
            </CreationPreview>
          )}

          {!creation && (
            <div className="grid place-items-center py-16 text-muted-foreground" role="status">
              <Loader2 className="size-8 animate-spin motion-reduce:animate-none" aria-label="Chargement" />
            </div>
          )}

          {creation && isRunning(creation) && (
            <p className="mx-auto max-w-md rounded-xl bg-secondary/70 p-3 text-center text-sm">
              Vous pouvez quitter cette page : votre création sera dans <Link href="/app/creations" className="font-medium text-primary underline underline-offset-4">Mes créations</Link>.
            </p>
          )}

          {creation?.status === "COMPLETED" && (
            <div className="mx-auto max-w-sm space-y-3">
              <p className="text-center text-sm text-muted-foreground">
                {credits(creation.credits)} utilisés · Solde : <strong className="text-foreground">{credits(balance)}</strong>
              </p>
              <ResultActions creation={creation} onEdit={editAgain} extra={<Button asChild variant="link" className="w-full"><Link href={`/app/creations/${creation.id}`}>Voir les détails</Link></Button>} />
            </div>
          )}

          {creation?.status === "FAILED" && (
            <div className="mx-auto max-w-sm space-y-3">
              <Alert role="status" className="border-success/40 bg-success/10">
                <ShieldCheck className="size-4 text-success" aria-hidden />
                <AlertDescription>Vos {credits(creation.credits)} ont été restitués. Vous pouvez réessayer.</AlertDescription>
              </Alert>
              <Button type="button" size="lg" className="h-12 w-full" onClick={editAgain}>
                <Pencil aria-hidden /> Réessayer
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
