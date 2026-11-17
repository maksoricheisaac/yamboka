/**
 * Seuil d'écart entre le tarif configuré et le prix annoncé par le fournisseur. Au-delà, la tarification
 * retient le plus élevé des deux pour les nouveaux devis et l'administration alerte.
 *
 * Isolé dans son propre fichier pour que le catalogue et le calibrage le partagent sans s'importer l'un
 * l'autre (le calibrage dépend du catalogue, pas l'inverse).
 */
export const DEVIATION_ALERT_PERCENT = 5;
