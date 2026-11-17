/**
 * Abstraction d'un fournisseur de génération IA (vidéo / image). Le registre de crédits et les générations
 * ne dépendent que de cette interface : changer de fournisseur ne touche pas au reste.
 * Deux implémentations : simulée (aucun appel réseau, aucun coût) et Higgsfield (appels réels, payants).
 */

/** Statuts normalisés, indépendants du fournisseur. */
export type GenerationRunStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  /** Refusé par la modération de contenu du fournisseur. */
  | 'rejected'
  | 'canceled';

export interface SubmitGenerationRequest {
  /** Chemin du modèle chez le fournisseur (GenerationProduct.providerModel). */
  model: string;
  /** Paramètres propres au modèle (video_url, image_urls, prompt, resolution…). */
  input: Record<string, unknown>;
  /** Identique à chaque nouvel essai d'une même génération : évite de payer deux fois. */
  idempotencyKey: string;
}

export interface SubmitGenerationResult {
  requestId: string;
  statusUrl: string;
  cancelUrl?: string;
  status: GenerationRunStatus;
}

export interface GenerationStatusResult {
  status: GenerationRunStatus;
  /** URL du fichier produit (vidéo ou première image), présente quand status = completed. */
  outputUrl?: string;
  error?: string;
}

/** Le fournisseur est injoignable ou en erreur : on peut réessayer plus tard. */
export class GenerationUnavailableError extends Error {}
/** Identifiants refusés ou compte sans droit d'accès : inutile de réessayer tant que rien n'est corrigé. */
export class GenerationAuthError extends Error {}
/** Le fournisseur a refusé la demande (paramètres invalides, contenu non conforme…). */
export class GenerationRejectedError extends Error {}
/**
 * Le compte prépayé du fournisseur est à sec (Higgsfield : 403 « not_enough_credits »). Rien ne sera généré
 * tant que le solde n'est pas rechargé : distinct d'identifiants refusés (GenerationAuthError), qui demande
 * une correction de configuration, et d'un refus de la demande elle-même (GenerationRejectedError).
 */
export class GenerationProviderOutOfCreditsError extends Error {}

export abstract class GenerationProvider {
  /** Nom du fournisseur (« mock » ou « higgsfield »). */
  abstract readonly name: string;

  /** Envoie une demande de génération. Ne coûte rien tant que la demande n'est pas acceptée. */
  abstract submit(
    request: SubmitGenerationRequest,
  ): Promise<SubmitGenerationResult>;

  /** Statut réel chez le fournisseur : seule source de vérité pour finaliser ou rembourser. */
  abstract getStatus(statusUrl: string): Promise<GenerationStatusResult>;

  /** Annule une demande encore en file ; sans effet une fois le traitement commencé. */
  abstract cancel(cancelUrl: string): Promise<void>;

  /**
   * Dépose un fichier d'entrée chez le fournisseur et renvoie l'URL HTTPS publique à passer au modèle.
   * Sert quand le fichier n'est pas déjà accessible publiquement.
   */
  abstract uploadInput(data: Buffer, contentType: string): Promise<string>;

  /** Vérifie les identifiants sans lancer de génération (donc sans coût). */
  abstract diagnose(): Promise<{ ok: boolean; detail: string }>;

  /**
   * Prix annoncé par le fournisseur pour une demande, SANS la lancer ni la payer. Sert au calibrage des
   * tarifs et au contrôle périodique de la configuration. Absent du fournisseur simulé : l'appelant doit
   * traiter le cas « non disponible » plutôt que de supposer un prix.
   */
  estimate?(
    model: string,
    input: Record<string, unknown>,
  ): Promise<{ status: number; body: unknown }>;
}
