import type { CreationFormat, CreationKind, CreationView } from "@yamboka/shared";
import { Clapperboard, Image as ImageIcon, PartyPopper, type LucideIcon } from "lucide-react";

/** Les URL de médias renvoyées par l'API commencent déjà par /api, chemin relatif résolu sur l'hôte courant. */
export function mediaUrl(url: string | null): string | null {
  return url;
}

export const KINDS: Record<CreationKind, { label: string; short: string; hint: string; icon: LucideIcon; photoLabel: string }> = {
  affiche: {
    label: "Affiche",
    short: "Affiche",
    hint: "Une image publicitaire à partager",
    icon: ImageIcon,
    photoLabel: "Photo du produit",
  },
  pub: {
    label: "Vidéo pub",
    short: "Vidéo pub",
    hint: "Une courte vidéo pour vendre",
    icon: Clapperboard,
    photoLabel: "Photo du produit",
  },
  fun: {
    label: "Vidéo fun",
    short: "Vidéo fun",
    hint: "Votre selfie, dans une tendance",
    icon: PartyPopper,
    photoLabel: "Votre selfie",
  },
};

/** Exemples concrets affichés dans le champ de description (placeholder). */
export const PROMPT_HINTS: Record<CreationKind, string> = {
  affiche: "Ex : Affiche élégante pour cette robe à 15 000 FCFA, avec le texte PROMOTION -20 % CE WEEK-END et mon numéro 06 606 31 33. Fond luxueux, éclairage de studio.",
  pub: "Ex : Fais tourner lentement le produit avec un éclairage de studio, puis un zoom cinématographique. Texte : 10 000 FCFA.",
  fun: "Ex : Ajoute une ambiance de fête, avec des lumières colorées.",
};

export const KIND_ORDER: CreationKind[] = ["affiche", "pub", "fun"];

export function isKind(value: string | undefined | null): value is CreationKind {
  return value === "affiche" || value === "pub" || value === "fun";
}

/**
 * Formats proposés pour une image. Tous sont demandés TELS QUELS au modèle (paramètre natif, vérifié auprès du
 * fournisseur) et contrôlés sur le fichier reçu : aucun recadrage après coup, donc aucune déformation.
 */
export const FORMATS: { value: CreationFormat; group: string; label: string; where: string; ratio: string }[] = [
  { value: "1:1", group: "Carré", label: "Carré", where: "Publications sur les réseaux sociaux", ratio: "1 / 1" },
  { value: "4:3", group: "Paysage", label: "Paysage", where: "Affiche horizontale, visuel classique", ratio: "4 / 3" },
  { value: "3:2", group: "Paysage", label: "Paysage large", where: "Affiche horizontale, photo", ratio: "3 / 2" },
  { value: "3:4", group: "Portrait", label: "Portrait", where: "Affiche verticale", ratio: "3 / 4" },
  { value: "2:3", group: "Portrait", label: "Portrait haut", where: "Affiche verticale, poster", ratio: "2 / 3" },
  { value: "16:9", group: "Panoramique", label: "Panoramique", where: "Bannière, visuel très large", ratio: "16 / 9" },
  { value: "9:16", group: "Vertical", label: "Vertical", where: "Stories, statuts WhatsApp, mobile", ratio: "9 / 16" },
];

export function ratioOf(format: CreationFormat | undefined): string {
  return FORMATS.find((f) => f.value === format)?.ratio ?? "9 / 16";
}

/** Largeur ÷ hauteur d'un format (« 3:4 » → 0,75). */
export function ratioValue(format: CreationFormat | undefined): number {
  const [w, h] = (format ?? "9:16").split(":").map(Number);
  return w && h ? w / h : 9 / 16;
}

/** Largeur maximale d'un résultat ou d'un aperçu : étroit pour un portrait, plus large pour un paysage. */
export function previewWidthClass(format: CreationFormat | undefined): string {
  const r = ratioValue(format);
  if (r < 0.7) return "max-w-[8rem] sm:max-w-[13rem] lg:max-w-[15rem]";
  if (r < 1) return "max-w-[10rem] sm:max-w-[16rem] lg:max-w-[18rem]";
  if (r === 1) return "max-w-[10rem] sm:max-w-[16rem] lg:max-w-[18rem]";
  return "max-w-[15rem] sm:max-w-xs";
}

/** Pluriel français : « 1 crédit », « 2 crédits », « 0 crédit ». */
export function credits(n: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(n)} ${n > 1 ? "crédits" : "crédit"}`;
}

export function isRunning(c: Pick<CreationView, "status">): boolean {
  return c.status === "PENDING" || c.status === "PROCESSING";
}

/** Libellé court d'une création pour les lecteurs d'écran et les titres. */
export function creationTitle(c: Pick<CreationView, "styleName" | "kind">): string {
  return c.styleName ? `${KINDS[c.kind].label} · ${c.styleName}` : KINDS[c.kind].label;
}

/** Titre de la page d'une création : le style CHOISI par l'utilisateur, sinon un titre neutre (jamais un nom inventé). */
export function creationHeading(c: Pick<CreationView, "styleName" | "kind">): string {
  if (c.styleName) return c.styleName;
  return c.kind === "affiche" ? "Votre affiche" : c.kind === "pub" ? "Votre vidéo publicitaire" : "Votre vidéo tendance";
}

/** Réduit une photo avant l'envoi : moins de données sur une connexion lente, et plus d'infos de position (EXIF). */
export async function compressPhoto(file: File, maxSide = 1600): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Ce fichier n’est pas une photo lisible. Choisissez une image JPG, PNG ou WebP.");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Impossible de préparer la photo sur cet appareil.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new Error("Impossible de préparer la photo sur cet appareil.");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

/**
 * Partage sur WhatsApp. Le fichier est privé : on ne peut pas envoyer un lien public. Sur mobile, la feuille de
 * partage du téléphone envoie le fichier lui-même ; ailleurs, on le télécharge et on ouvre WhatsApp avec un message.
 */
export async function shareOnWhatsApp(c: Pick<CreationView, "fileUrl" | "downloadUrl" | "isVideo" | "styleName">): Promise<"shared" | "downloaded"> {
  const url = mediaUrl(c.fileUrl);
  if (!url) throw new Error("Cette création n’est pas encore prête.");
  const text = "Créé avec Yamboka";
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (res.ok) {
      const blob = await res.blob();
      const file = new File([blob], `yamboka.${c.isVideo ? "mp4" : "png"}`, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return "shared";
      }
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "shared";
  }
  const link = document.createElement("a");
  link.href = mediaUrl(c.downloadUrl) ?? url;
  link.click();
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  return "downloaded";
}
