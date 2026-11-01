/**
 * Abstraction du stockage de fichiers (entrées des utilisateurs, résultats, vignettes de presets).
 * Les fichiers sont privés : on ne les expose jamais directement, uniquement par URL signée à durée limitée.
 * Deux implémentations : disque local (développement) et Cloudflare R2 (compatible S3).
 */

export interface StorageDiagnosis {
  ok: boolean;
  detail: string;
}

/** Le stockage est injoignable ou refuse l'accès : réessayer plus tard ou vérifier la configuration. */
export class StorageUnavailableError extends Error {}

export abstract class StorageDriver {
  /** Nom du pilote (« local » ou « r2 »). */
  abstract readonly name: string;

  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;

  abstract get(key: string): Promise<Buffer>;

  /** Supprime l'objet ; sans erreur s'il n'existe pas (idempotent). */
  abstract delete(key: string): Promise<void>;

  abstract exists(key: string): Promise<boolean>;

  /**
   * URL de lecture temporaire accessible depuis Internet, ou null si le pilote n'en fournit pas
   * (le disque local ne peut pas être lu par un service externe).
   */
  abstract signedUrl(key: string, ttlSeconds: number): Promise<string | null>;

  /** Vérifie la configuration par un aller-retour réel (écriture, lecture, suppression). */
  abstract diagnose(): Promise<StorageDiagnosis>;
}

/** Refuse les clés qui sortiraient du dossier de stockage ou seraient ambiguës. */
export function assertSafeKey(key: string): void {
  if (
    !key ||
    key.startsWith('/') ||
    key.includes('\\') ||
    key.split('/').some((part) => part === '..' || part === '.' || part === '')
  ) {
    throw new Error(`Clé de stockage invalide : ${key}`);
  }
}
