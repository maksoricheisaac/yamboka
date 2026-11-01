"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MAX_PROMPT_LENGTH, type CreationFormat, type CreationKind, type CreationView, type StyleView } from "@yamboka/shared";
import { Coins, Loader2, Pencil, ShieldCheck, Sparkles, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiGet, apiUpload } from "@/lib/api-client";
import { FORMATS, KINDS, KIND_ORDER, PROMPT_HINTS, credits, isRunning } from "@/lib/creations";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CreationMedia } from "./creation-media";
import { CreationPreview } from "./creation-preview";
import { PhotoDrop } from "./photo-drop";
import { ResultActions } from "./result-actions";
import { StylePicker } from "./style-picker";

interface StudioProps {
  styles: StyleView[];
  balance: number;
  emailVerified: boolean;
  initialKind: CreationKind;
  /** Style demandé depuis « Tendances » : la tendance (fun) ou le modèle d'une affiche / pub. */
  initialStyleId: string | null;
  initialPrompt: string;
}

type FieldErrors = Partial<Record<"photo" | "style" | "prompt" | "consent", string>>;

/** Un pictogramme à la proportion exacte du format : on comprend sans lire. */
function RatioGlyph({ format }: { format: CreationFormat }) {
  const size = format === "9:16" ? "h-6 w-[0.8rem]" : format === "1:1" ? "size-5" : "h-3.5 w-6";
  return <span aria-hidden className={cn("block rounded-[3px] border-2 border-current", size)} />;
}

export function Studio({ styles, balance, emailVerified, initialKind, initialStyleId, initialPrompt }: StudioProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<CreationKind>(initialKind);
  // Tendance choisie (fun), et modèle facultatif d'une affiche / pub (venu de « Tendances »).
  const initialStyle = styles.find((s) => s.id === initialStyleId);
  const [trendId, setTrendId] = useState<string | null>(initialStyle?.kind === "fun" ? initialStyle.id : (styles.find((s) => s.kind === "fun")?.id ?? null));
  const [modelId, setModelId] = useState<string | null>(initialStyle && initialStyle.kind !== "fun" ? initialStyle.id : null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [format, setFormat] = useState<CreationFormat>("9:16");
  const [consent, setConsent] = useState(false);
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

  const fun = kind === "fun";
  const kindStyles = styles.filter((s) => s.kind === kind);
  const model = !fun ? (styles.find((s) => s.id === modelId && s.kind === kind) ?? null) : null;
  // Style qui sera utilisé : la tendance choisie, le modèle, ou le style par défaut du type (choisi par le serveur).
  const style = fun ? (styles.find((s) => s.id === trendId) ?? null) : (model ?? kindStyles[0] ?? null);
  const cost = style?.credits ?? 0;
  const after = balance - cost;
  const enough = after >= 0;
  const tracking = creationId !== null;
  const effectiveFormat: CreationFormat = fun ? "9:16" : format;

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
    if (!photo) e.photo = fun ? "Ajoutez votre selfie." : "Ajoutez la photo de votre produit.";
    if (fun && !style) e.style = "Choisissez une tendance.";
    if (!fun && !prompt.trim()) e.prompt = "Décrivez ce que vous souhaitez.";
    if (!consent) e.consent = "Confirmez que vous avez le droit d’utiliser cette photo.";
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
      form.set("kind", kind);
      if (fun && style) form.set("styleId", style.id);
      if (model) form.set("styleId", model.id);
      form.set("format", effectiveFormat);
      form.set("consent", "true");
      if (prompt.trim()) form.set("prompt", prompt.trim());
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
          else if (d.field === "styleId") next.style = d.message;
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

  const canSubmit = emailVerified && !sending && !!style && enough;
  const showPreview = tracking || !!photoUrl;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
      {/* ───────── Formulaire ───────── */}
      <div className="min-w-0 space-y-6">
        <div role="tablist" aria-label="Type de création" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {KIND_ORDER.map((k) => {
            const Icon = KINDS[k].icon;
            const active = kind === k;
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={tracking}
                onClick={() => {
                  setKind(k);
                  setErrors({});
                  setFormError(null);
                }}
                className={cn(
                  "flex h-11 items-center justify-center gap-1.5 rounded-lg px-1 text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-60",
                  active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{KINDS[k].label}</span>
              </button>
            );
          })}
        </div>

        <section className="space-y-2.5" aria-labelledby="photo-title">
          <h2 id="photo-title" className="font-heading text-base font-bold">{KINDS[kind].photoLabel}</h2>
          <PhotoDrop label={fun ? "Ajouter votre selfie" : "Ajouter une photo"} previewUrl={photoUrl} onPick={pickPhoto} disabled={tracking} error={errors.photo} />
        </section>

        {fun && (
          <section className="space-y-2.5" aria-labelledby="trend-title">
            <h2 id="trend-title" className="font-heading text-base font-bold">Choisissez une tendance</h2>
            {kindStyles.length === 0 ? (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Aucune tendance n’est disponible pour le moment.</p>
            ) : (
              <StylePicker styles={kindStyles} value={trendId} onChange={setTrendId} legend="Tendances" disabled={tracking} />
            )}
            {errors.style && <p role="alert" className="text-sm font-medium text-destructive">{errors.style}</p>}
          </section>
        )}

        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="creation-prompt" id="prompt-title" className="font-heading text-base font-bold">
              {fun ? "Instructions" : "Décrivez ce que vous voulez"}
              {fun && <span className="ml-1.5 text-sm font-normal text-muted-foreground">(facultatif)</span>}
            </Label>
            <span className="text-xs tabular-nums text-muted-foreground" aria-hidden>{prompt.length}/{MAX_PROMPT_LENGTH}</span>
          </div>
          {model && (
            <p className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-3 pr-1 text-sm font-medium text-primary">
              <span className="truncate">Modèle : {model.name}</span>
              <button type="button" onClick={() => setModelId(null)} disabled={tracking} aria-label="Retirer le modèle" className="grid size-6 shrink-0 place-items-center rounded-full outline-none hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring">
                <X className="size-3.5" aria-hidden />
              </button>
            </p>
          )}
          <Textarea
            id="creation-prompt"
            value={prompt}
            maxLength={MAX_PROMPT_LENGTH}
            rows={5}
            disabled={tracking}
            placeholder={PROMPT_HINTS[kind]}
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

        {!fun && (
          <section className="space-y-2.5" aria-labelledby="format-title">
            <h2 id="format-title" className="font-heading text-base font-bold">Format</h2>
            <div role="radiogroup" aria-labelledby="format-title" className="grid grid-cols-3 gap-2">
              {FORMATS.map((f) => (
                <label key={f.value} className="cursor-pointer">
                  <input type="radio" name="format" value={f.value} checked={format === f.value} onChange={() => setFormat(f.value)} disabled={tracking} className="peer sr-only" />
                  <span className="flex h-full min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border bg-card px-2 py-2.5 text-muted-foreground transition-colors peer-checked:border-primary peer-checked:bg-primary/8 peer-checked:text-primary peer-checked:ring-2 peer-checked:ring-primary/30 peer-focus-visible:ring-3 peer-focus-visible:ring-ring/70 peer-disabled:opacity-60">
                    <RatioGlyph format={f.value} />
                    <span className="text-sm font-semibold text-foreground">{f.label}</span>
                    <span className="text-[0.7rem] leading-none">{f.value}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        )}

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
            {!style ? (
              <p className="rounded-xl bg-muted p-3 text-center text-sm text-muted-foreground" role="status">
                {fun ? "Choisissez une tendance pour continuer." : "Ce type de création n’est pas disponible pour le moment."}
              </p>
            ) : emailVerified && !enough ? (
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
            {style && (
              <p className="text-center text-xs text-muted-foreground">
                {enough ? `Solde après : ${formatNumber(after)} ${after > 1 ? "crédits" : "crédit"}` : `Solde : ${formatNumber(balance)} ${balance > 1 ? "crédits" : "crédit"}`} · Si la création échoue, vos crédits sont restitués.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ───────── Aperçu, attente, résultat ───────── */}
      <aside ref={resultRef} aria-label="Aperçu" className={cn("min-w-0 space-y-4 lg:sticky lg:top-4", !showPreview && "hidden lg:block")}>
        {!tracking && <CreationPreview format={effectiveFormat} photoUrl={photoUrl} caption={fun && style ? `Tendance : ${style.name}` : undefined} />}

        {tracking && creation && isRunning(creation) && (
          <CreationPreview format={effectiveFormat} photoUrl={photoUrl} caption=" ">
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
          <CreationPreview format={effectiveFormat} photoUrl={photoUrl} caption=" ">
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
