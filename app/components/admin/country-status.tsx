import type { CatalogStatus } from "@yamboka/shared";
import { CATALOG_STATUS_LABELS } from "@yamboka/shared";
import { Pill } from "@/components/admin/ui";

const TONE: Record<CatalogStatus, "ok" | "warn" | "neutral"> = { ACTIVE: "ok", COMING_SOON: "warn", DISABLED: "neutral" };

/** Statut d'un pays ou d'un moyen de paiement : le libellé porte l'information, la couleur n'est qu'un renfort. */
export function CountryStatusPill({ status }: { status: CatalogStatus }) {
  return <Pill tone={TONE[status]}>{CATALOG_STATUS_LABELS[status]}</Pill>;
}
