"use client";

import { Camera, ImagePlus, RefreshCw } from "lucide-react";
import { useId, useRef, useState } from "react";
import { compressPhoto } from "@/lib/creations";
import { cn } from "@/lib/utils";

/**
 * Choix de la photo. Sur téléphone, le sélecteur natif propose l'appareil photo ET la galerie. La photo est réduite
 * dans le navigateur avant l'envoi (connexion lente) ; l'aperçu s'affiche tout de suite.
 */
export function PhotoDrop({
  label,
  previewUrl,
  onPick,
  disabled,
  error,
}: {
  label: string;
  previewUrl: string | null;
  onPick: (file: File) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  async function handle(file: File | undefined) {
    if (!file) return;
    setLocalError(null);
    setBusy(true);
    try {
      onPick(await compressPhoto(file));
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Photo illisible.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const shownError = localError ?? error;
  return (
    <div className="space-y-2">
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => void handle(e.target.files?.[0])}
        aria-describedby={`${id}-help`}
      />
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void handle(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "group relative flex min-h-24 cursor-pointer items-center gap-3.5 overflow-hidden rounded-2xl border-2 border-dashed bg-card p-3 transition-colors focus-within:ring-3 focus-within:ring-ring/60 hover:border-primary/60",
          over && "border-primary bg-primary/5",
          previewUrl && "border-solid border-border",
          (disabled || busy) && "pointer-events-none opacity-60",
        )}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob), pas d'optimisation possible
          <img src={previewUrl} alt="Aperçu de la photo choisie" className="size-20 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Camera className="size-7" aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">{previewUrl ? "Photo prête" : busy ? "Préparation…" : label}</span>
          <span id={`${id}-help`} className="mt-0.5 block text-sm text-muted-foreground">
            {previewUrl ? "Touchez pour la changer." : "Appareil photo ou galerie · JPG, PNG, WebP"}
          </span>
        </span>
        <span className="hidden size-10 shrink-0 place-items-center rounded-full bg-muted text-foreground sm:grid" aria-hidden>
          {previewUrl ? <RefreshCw className="size-4" /> : <ImagePlus className="size-4" />}
        </span>
      </label>
      {shownError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {shownError}
        </p>
      )}
    </div>
  );
}
