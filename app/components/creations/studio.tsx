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
import { Coins, Loader2, Pencil, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiGet, apiUpload } from "@/lib/api-client";
import { FORMATS, PROMPT_HINT, credits, isRunning, ratioValue } from "@/lib/creations";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CreationMedia } from "./creation-media";
import { CreationPreview } from "./creation-preview";
import { PhotoDrop } from "./photo-drop";
import { ResultActions } from "./result-actions";
import { StylePicker } from "./style-picker";

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

type FieldErrors = Partial<Record<"photo" | "prompt" | "consent" | "duration" | "confirm", string>>;

/** Un pictogramme à la proportion exacte du format : on comprend sans lire. */
function RatioGlyph({ format }: { format: CreationFormat }) {
  const r = ratioValue(format);
  const box = 28; // le grand côté du pictogramme, en pixels
  const width = r >= 1 ? box : Math.round(box * r);
  const height = r >= 1 ? Math.round(box / r) : box;
  return <span aria-hidden className="block rounded-[3px] border-2 border-current" style={{ width, height }} />;
}

export function Studio({ styles, config, balance, emailVerified, initialStyleId, initialPrompt }: StudioProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const initialStyle = styles.find((s) => s.id === initialStyleId) ?? null;
  const [styleId, setStyleId] = useState<string | null>(initialStyle?.id ?? null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(initialPrompt || initialStyle?.prompt || "");
  const [format, setFormat] = useState<CreationFormat>(initialStyle?.format ?? DEFAULT_FORMAT);
  const [resolution, setResolution] = useState<VideoResolution>(initialStyle?.resolution ?? DEFAULT_RESOLUTION);
  const [duration, setDuration] = useState<number>(initialStyle?.durationSeconds ?? VIDEO_DURATION.default);
  const [consent, setConsent] = useState(false);
  const [personPhoto, setPersonPhoto] = useState(false);
  const [confirmCost, setConfirmCost] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [creationId, setCreationId] = useState<string | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  const urlRef = useRef<string | null>(null);

  // Aperçu local de la photo : l'URL temporaire est libérée quand on change de photo et à la fermeture de la page.
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  function pickPhoto(file: File) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(file);
    setPhoto(file);
    setPhotoUrl(urlRef.current);
    setErrors((e) => ({ ...e, photo: undefined }));
  }

  /** Choisir une idée remplit le texte et les réglages proposés ; le client peut tout modifier ensuite. */
  function pickIdea(id: string) {
    const idea = styles.find((x) => x.id === id);
    if (!idea) return;
    setStyleId(id);
    if (idea.prompt) setPrompt(idea.prompt);
    if (idea.format) setFormat(idea.format);
    if (idea.resolution) setResolution(idea.resolution);
    if (idea.durationSeconds) setDuration(idea.durationSeconds);
    setErrors((e) => ({ ...e, prompt: undefined }));
  }

  const idea = styles.find((x) => x.id === styleId) ?? null;
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
    if (!consent) e.consent = "Confirmez que vous avez le droit d’utiliser cette photo.";
    if (mustConfirm && !confirmCost) e.confirm = `Confirmez la dépense de ${credits(cost)}.`;
    return e;
  }

  async function submit() {
    setFormError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0 || !photo) return;
    setSending(true);
    try {
      const form = new FormData();
      form.set("photo", photo, "photo.jpg");
      if (idea) form.set("styleId", idea.id);
      form.set("format", format);
      form.set("resolution", resolution);
      form.set("durationSeconds", String(duration));
      form.set("consent", "true");
      form.set("personPhoto", String(personPhoto));
      form.set("prompt", prompt.trim());
      const { creation: created } = await apiUpload<{ creation: CreationView }>("/creations", form);
      queryClient.setQueryData(["creation", created.id], created);
      setCreationId(created.id);
      router.refresh(); // le solde de l'en-tête reflète tout de suite la réservation
    } catch (err) {
      if (err instanceof ApiError && err.details.length > 0) {
        const next: FieldErrors = {};
        for (const d of err.details) {
          if (d.field === "prompt") next.prompt = d.message;
          else if (d.field === "consent") next.consent = d.message;
          else if (d.field === "durationSeconds") next.duration = d.message;
        }
        setErrors(next);
        if (Object.keys(next).length === 0) setFormError(err.message);
      } else {
        setFormError(err instanceof ApiError ? err.message : "Une erreur est survenue. Veuillez réessayer.");
      }
    } finally {
      setSending(false);
    }
  }

  function editAgain() {
    setCreationId(null);
    setFormError(null);
  }

  const canSubmit = emailVerified && !sending && durationOk && enough;
  const showPreview = tracking || !!photoUrl;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
      {/* ───────── Formulaire ───────── */}
      <div className="min-w-0 space-y-6">
        <section className="space-y-2.5" aria-labelledby="photo-title">
          <h2 id="photo-title" className="font-heading text-base font-bold">Votre photo</h2>
          <PhotoDrop label="Ajouter une photo" previewUrl={photoUrl} onPick={pickPhoto} disabled={tracking} error={errors.photo} />
        </section>

        {styles.length > 0 && (
          <section className="space-y-2.5" aria-labelledby="idea-title">
            <h2 id="idea-title" className="font-heading text-base font-bold">
              Partir d’une idée <span className="ml-1.5 text-sm font-normal text-muted-foreground">(facultatif)</span>
            </h2>
            <StylePicker styles={styles} value={styleId} onChange={pickIdea} legend="Idées" disabled={tracking} />
            {idea?.photoHint && <p className="text-sm text-muted-foreground">Conseil photo : {idea.photoHint}</p>}
          </section>
        )}

        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="creation-prompt" id="prompt-title" className="font-heading text-base font-bold">Décrivez votre vidéo</Label>
            <span className="text-xs tabular-nums text-muted-foreground" aria-hidden>{prompt.length}/{MAX_PROMPT_LENGTH}</span>
          </div>
          <Textarea
            id="creation-prompt"
            value={prompt}
            maxLength={MAX_PROMPT_LENGTH}
            rows={5}
            disabled={tracking}
            placeholder={PROMPT_HINT}
            aria-invalid={!!errors.prompt}
            aria-describedby={errors.prompt ? "prompt-error" : undefined}
            onChange={(e) => {
              setPrompt(e.target.value);
              setErrors((x) => ({ ...x, prompt: undefined }));
            }}
            className="min-h-32 resize-y bg-card text-base leading-relaxed"
          />
          {errors.prompt && <p id="prompt-error" role="alert" className="text-sm font-medium text-destructive">{errors.prompt}</p>}
        </div>

        <section className="space-y-2.5" aria-labelledby="format-title">
          <h2 id="format-title" className="font-heading text-base font-bold">Format</h2>
          <div role="radiogroup" aria-labelledby="format-title" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {FORMATS.map((f) => (
              <label key={f.value} className="cursor-pointer">
                <input type="radio" name="format" value={f.value} checked={format === f.value} onChange={() => setFormat(f.value)} disabled={tracking} className="peer sr-only" />
                <span className="flex h-full min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border bg-card px-2 py-2.5 text-muted-foreground transition-colors peer-checked:border-primary peer-checked:bg-primary/8 peer-checked:text-primary peer-checked:ring-2 peer-checked:ring-primary/30 peer-focus-visible:ring-3 peer-focus-visible:ring-ring/70 peer-disabled:opacity-60">
                  <span className="grid h-8 place-items-center">
                    <RatioGlyph format={f.value} />
                  </span>
                  <span className="text-center text-xs font-semibold leading-tight text-foreground">{f.label}</span>
                  <span className="text-[0.7rem] leading-none">{f.value}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {FORMATS.find((f) => f.value === format)?.where}
          </p>
        </section>

        <section className="space-y-2.5" aria-labelledby="resolution-title">
          <h2 id="resolution-title" className="font-heading text-base font-bold">Qualité</h2>
          <div role="radiogroup" aria-labelledby="resolution-title" className="grid grid-cols-3 gap-2">
            {VIDEO_RESOLUTIONS.map((r) => (
              <label key={r} className="cursor-pointer">
                <input type="radio" name="resolution" value={r} checked={resolution === r} onChange={() => setResolution(r)} disabled={tracking} className="peer sr-only" />
                <span className="flex h-full flex-col items-center justify-center gap-0.5 rounded-xl border bg-card px-2 py-3 text-center transition-colors peer-checked:border-primary peer-checked:bg-primary/8 peer-checked:ring-2 peer-checked:ring-primary/30 peer-focus-visible:ring-3 peer-focus-visible:ring-ring/70 peer-disabled:opacity-60">
                  <span className="text-sm font-semibold">{RESOLUTION_LABELS[r]}</span>
                  <span className="text-[0.7rem] text-muted-foreground">{r}</span>
                  <span className="text-xs font-medium text-primary">{credits(config.rates[r])} / s</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-2.5" aria-labelledby="duration-title">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="creation-duration" id="duration-title" className="font-heading text-base font-bold">Durée</Label>
            <span className="text-sm font-semibold tabular-nums">{duration} s</span>
          </div>
          <input
            id="creation-duration"
            type="range"
            min={VIDEO_DURATION.min}
            max={VIDEO_DURATION.max}
            step={1}
            value={duration}
            disabled={tracking}
            onChange={(e) => {
              setDuration(Number(e.target.value));
              setErrors((x) => ({ ...x, duration: undefined, confirm: undefined }));
              setConfirmCost(false);
            }}
            aria-describedby={errors.duration ? "duration-error" : undefined}
            className="h-6 w-full cursor-pointer accent-primary disabled:opacity-60"
          />
          <p className="flex justify-between text-xs text-muted-foreground">
            <span>{VIDEO_DURATION.min} s</span>
            <span>{VIDEO_DURATION.max} s</span>
          </p>
          {errors.duration && <p id="duration-error" role="alert" className="text-sm font-medium text-destructive">{errors.duration}</p>}
        </section>

        {/* ───────── Lancement : coût avant confirmation ───────── */}
        {!tracking && (
          <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 -mx-4 space-y-2.5 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:static lg:z-auto lg:mx-0 lg:rounded-2xl lg:border lg:bg-card lg:p-4">
            <div className="flex items-start gap-2.5">
              <Checkbox id="creation-consent" checked={consent} onCheckedChange={(v) => { setConsent(v === true); setErrors((e) => ({ ...e, consent: undefined })); }} aria-invalid={!!errors.consent} className="mt-0.5 size-5" />
              <div className="space-y-0.5">
                <Label htmlFor="creation-consent" className="cursor-pointer text-[0.8rem] font-normal leading-snug text-muted-foreground">
                  Je confirme avoir le droit d’utiliser cette photo et que son contenu respecte la charte d’utilisation de Yamboka.
                </Label>
                {errors.consent && <p role="alert" className="text-sm font-medium text-destructive">{errors.consent}</p>}
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Checkbox id="creation-person" checked={personPhoto} onCheckedChange={(v) => setPersonPhoto(v === true)} className="mt-0.5 size-5" />
              <Label htmlFor="creation-person" className="cursor-pointer text-[0.8rem] font-normal leading-snug text-muted-foreground">
                Cette photo montre une personne.
              </Label>
            </div>
            {mustConfirm && enough && (
              <div className="flex items-start gap-2.5 rounded-xl bg-accent/15 p-2.5">
                <Checkbox id="creation-confirm" checked={confirmCost} onCheckedChange={(v) => { setConfirmCost(v === true); setErrors((e) => ({ ...e, confirm: undefined })); }} aria-invalid={!!errors.confirm} className="mt-0.5 size-5" />
                <div className="space-y-0.5">
                  <Label htmlFor="creation-confirm" className="cursor-pointer text-[0.8rem] font-medium leading-snug">
                    Cette vidéo coûte {credits(cost)}, soit une part importante de votre solde. Je confirme.
                  </Label>
                  {errors.confirm && <p role="alert" className="text-sm font-medium text-destructive">{errors.confirm}</p>}
                </div>
              </div>
            )}
            {!emailVerified && (
              <Alert className="border-accent bg-accent/15" role="status">
                <AlertDescription>
                  Confirmez d’abord votre adresse e-mail pour lancer une création. <Link href="/verifier-email" className="font-medium underline">Confirmer</Link>
                </AlertDescription>
              </Alert>
            )}
            {formError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            {emailVerified && !enough ? (
              <>
                <p className="flex items-center gap-2 text-sm font-medium" role="status">
                  <Coins className="size-4 text-primary" aria-hidden />
                  Il vous manque {credits(-after)} pour cette création.
                </p>
                <Button asChild size="lg" className="h-12 w-full text-base">
                  <Link href="/app/credits"><Coins aria-hidden /> Recharger mes crédits</Link>
                </Button>
              </>
            ) : (
              <Button type="button" size="lg" className="h-12 w-full text-base" onClick={() => void submit()} disabled={!canSubmit} aria-disabled={!canSubmit}>
                {sending ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles aria-hidden />}
                {sending ? "Envoi en cours…" : `Générer · ${credits(cost)}`}
              </Button>
            )}
            {durationOk && (
              <p className="text-center text-xs text-muted-foreground">
                {enough ? `Solde après : ${formatNumber(after)} ${after > 1 ? "crédits" : "crédit"}` : `Solde : ${formatNumber(balance)} ${balance > 1 ? "crédits" : "crédit"}`} · Si la création échoue, vos crédits sont restitués.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ───────── Aperçu, attente, résultat ───────── */}
      <aside ref={resultRef} aria-label="Aperçu" className={cn("min-w-0 space-y-4 lg:sticky lg:top-4", !showPreview && "hidden lg:block")}>
        {!tracking && <CreationPreview format={format} photoUrl={photoUrl} caption={idea ? `Idée : ${idea.name}` : undefined} />}

        {tracking && creation && isRunning(creation) && (
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

        {tracking && creation?.status === "COMPLETED" && <CreationMedia creation={creation} />}

        {tracking && creation?.status === "FAILED" && (
          <CreationPreview format={format} photoUrl={photoUrl} caption=" ">
            <div className="absolute inset-0 grid place-content-center justify-items-center gap-2 bg-black/65 p-4 text-center text-white">
              <TriangleAlert className="size-8 text-accent" aria-hidden />
              <p className="font-heading text-base font-bold">La création n’a pas abouti</p>
            </div>
          </CreationPreview>
        )}

        {tracking && !creation && (
          <div className="grid place-items-center py-16 text-muted-foreground" role="status">
            <Loader2 className="size-8 animate-spin motion-reduce:animate-none" aria-label="Chargement" />
          </div>
        )}

        {tracking && creation && isRunning(creation) && (
          <p className="rounded-xl bg-secondary/70 p-3 text-center text-sm">
            Vous pouvez quitter cette page : votre création sera dans <Link href="/app/creations" className="font-medium text-primary underline underline-offset-4">Mes créations</Link>.
          </p>
        )}

        {tracking && creation?.status === "COMPLETED" && (
          <div className="mx-auto max-w-sm space-y-3">
            <p className="text-center text-sm text-muted-foreground">
              {credits(creation.credits)} utilisés · Solde : <strong className="text-foreground">{credits(balance)}</strong>
            </p>
            <ResultActions creation={creation} onEdit={editAgain} extra={<Button asChild variant="link" className="w-full"><Link href={`/app/creations/${creation.id}`}>Voir les détails</Link></Button>} />
          </div>
        )}

        {tracking && creation?.status === "FAILED" && (
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
      </aside>
    </div>
  );
}
