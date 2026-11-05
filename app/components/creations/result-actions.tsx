"use client";

import type { CreationView } from "@yamboka/shared";
import { Download, Loader2, Pencil, RefreshCw, Share2 } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { mediaUrl, shareOnWhatsApp } from "@/lib/creations";

/**
 * Actions sur un résultat prêt. WhatsApp est l'action principale (c'est là que les créations sont diffusées).
 */
export function ResultActions({ creation, onEdit, extra }: { creation: CreationView; onEdit?: () => void; extra?: ReactNode }) {
  const [sharing, setSharing] = useState(false);
  const download = mediaUrl(creation.downloadUrl);
  // « Refaire » rouvre le formulaire avec le même style et la même description, à modifier avant de relancer.
  const redo = new URLSearchParams();
  if (creation.styleId) redo.set("style", creation.styleId);
  if (creation.prompt) redo.set("prompt", creation.prompt);
  const redoHref = `/app/creer?${redo}`;

  async function share() {
    setSharing(true);
    try {
      const how = await shareOnWhatsApp(creation);
      if (how === "downloaded") toast.success("Fichier téléchargé : ajoutez-le dans WhatsApp depuis votre galerie.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Partage impossible.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="space-y-2.5">
      <Button type="button" size="lg" className="h-12 w-full" onClick={() => void share()} disabled={sharing}>
        {sharing ? <Loader2 className="animate-spin" aria-hidden /> : <Share2 aria-hidden />} Partager sur WhatsApp
      </Button>
      <div className="grid grid-cols-2 gap-2.5">
        {download && (
          <Button asChild variant="outline" size="lg" className="h-12">
            <a href={download} download>
              <Download aria-hidden /> Télécharger
            </a>
          </Button>
        )}
        {onEdit ? (
          <Button type="button" variant="outline" size="lg" className="h-12" onClick={onEdit}>
            <Pencil aria-hidden /> Modifier
          </Button>
        ) : (
          <Button asChild variant="outline" size="lg" className="h-12">
            <Link href={redoHref}>
              <RefreshCw aria-hidden /> Refaire
            </Link>
          </Button>
        )}
      </div>
      {extra}
    </div>
  );
}
