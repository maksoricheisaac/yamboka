import { GenerationRejectedError } from '../generation/generation-provider';

/** Raison d'un échec, indépendante du fournisseur : sert à choisir le message affiché à l'utilisateur. */
export type FailureCode =
  | 'MODERATION'
  | 'TIMEOUT'
  | 'NO_RESULT'
  | 'BAD_RESULT'
  | 'FORMAT'
  | 'UNSUPPORTED'
  | 'PROVIDER'
  | 'CANCELED';

/** Résultat refusé : inexploitable, ou ne respectant pas la demande. Provoque l'échec et la restitution des crédits. */
export class OutputRejectedError extends GenerationRejectedError {
  constructor(
    readonly failureCode: FailureCode,
    message: string,
  ) {
    super(message);
  }
}

/** En dessous, ce n'est pas un vrai fichier (page d'erreur, fichier vide…). */
const MIN_VIDEO_BYTES = 10_000;

export interface CheckedOutput {
  mime: 'video/mp4';
  ext: 'mp4';
}

/**
 * Contrôle un fichier reçu du fournisseur AVANT de le déclarer réussi. Le type est lu dans les octets (jamais dans
 * l'en-tête HTTP, qui peut mentir) : une vidéo doit être un vrai MP4 (signature `ftyp` et index `moov`). Sinon la
 * création échoue et est remboursée : on ne livre jamais un fichier vide ou une page d'erreur.
 * Le format (9:16, 1:1, 16:9) n'est pas contrôlé ici : il découle de la vidéo de référence choisie par Yamboka.
 */
export function checkOutput(body: Buffer): CheckedOutput {
  const isMp4 =
    body.length >= MIN_VIDEO_BYTES &&
    body.toString('ascii', 4, 8) === 'ftyp' &&
    body.includes(Buffer.from('moov', 'ascii'));
  if (!isMp4) {
    throw new OutputRejectedError(
      'BAD_RESULT',
      `Vidéo inexploitable (${body.length} octets, MP4 non reconnu).`,
    );
  }
  return { mime: 'video/mp4', ext: 'mp4' };
}
