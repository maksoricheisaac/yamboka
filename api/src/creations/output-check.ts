import { GenerationRejectedError } from '../generation/generation-provider';
import { imageSize, sniffImage } from './image-sniff';

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

/** Écart toléré entre le format demandé et celui du fichier (certains modèles arrondissent à un multiple de 8 ou 16). */
export const RATIO_TOLERANCE = 0.03;
/** En dessous, ce n'est pas un vrai fichier (page d'erreur, fichier vide…). */
const MIN_IMAGE_BYTES = 1_000;
const MIN_VIDEO_BYTES = 10_000;

export interface CheckedOutput {
  mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4';
  ext: 'jpg' | 'png' | 'webp' | 'mp4';
  width: number | null;
  height: number | null;
}

/**
 * Contrôle un fichier reçu du fournisseur AVANT de le déclarer réussi. Le type est lu dans les octets (jamais dans
 * l'en-tête HTTP, qui peut mentir) ; une image doit avoir des dimensions lisibles et respecter le format demandé ;
 * une vidéo doit être un vrai MP4 (signature `ftyp` et index `moov`). Sinon la création échoue et est remboursée :
 * on ne livre jamais un fichier vide, une page d'erreur ou une image de mauvaises proportions.
 */
export function checkOutput(
  body: Buffer,
  opts: { isVideo: boolean; format?: string },
): CheckedOutput {
  if (opts.isVideo) {
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
    return { mime: 'video/mp4', ext: 'mp4', width: null, height: null };
  }

  const type = sniffImage(body);
  const size = type ? imageSize(body) : null;
  if (!type || !size || body.length < MIN_IMAGE_BYTES) {
    throw new OutputRejectedError(
      'BAD_RESULT',
      `Image inexploitable (${body.length} octets, type ou dimensions illisibles).`,
    );
  }
  if (opts.format) {
    const [w, h] = opts.format.split(':').map(Number);
    if (w && h) {
      const wanted = w / h;
      const got = size.width / size.height;
      if (Math.abs(got / wanted - 1) > RATIO_TOLERANCE) {
        throw new OutputRejectedError(
          'FORMAT',
          `Format non respecté : demandé ${opts.format}, reçu ${size.width}×${size.height}.`,
        );
      }
    }
  }
  return {
    mime: type.mime,
    ext: type.ext as CheckedOutput['ext'],
    width: size.width,
    height: size.height,
  };
}
