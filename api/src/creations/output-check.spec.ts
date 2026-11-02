import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mockImageDimensions, mockImagePng } from '../generation/mock-image';
import { imageSize, sniffImage } from './image-sniff';
import { checkOutput, OutputRejectedError } from './output-check';

/** JPEG minimal : signature + marqueur SOF0 portant hauteur puis largeur (suffit à lire les dimensions). */
function jpeg(width: number, height: number): Buffer {
  const b = Buffer.alloc(2000, 0x20);
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).copy(b, 0);
  b.write('JFIF', 6, 'ascii');
  const sof = 20;
  Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08]).copy(b, sof);
  b.writeUInt16BE(height, sof + 5);
  b.writeUInt16BE(width, sof + 7);
  return b;
}

/** WebP sans perte (VP8L) : 14 bits de largeur-1 puis de hauteur-1. */
function webpLossless(width: number, height: number): Buffer {
  const b = Buffer.alloc(2000, 0);
  b.write('RIFF', 0, 'ascii');
  b.write('WEBP', 8, 'ascii');
  b.write('VP8L', 12, 'ascii');
  b[20] = 0x2f;
  b.writeUInt32LE((width - 1) | ((height - 1) << 14), 21);
  return b;
}

/** WebP étendu (VP8X) : largeur-1 et hauteur-1 sur 3 octets chacune. */
function webpExtended(width: number, height: number): Buffer {
  const b = Buffer.alloc(2000, 0);
  b.write('RIFF', 0, 'ascii');
  b.write('WEBP', 8, 'ascii');
  b.write('VP8X', 12, 'ascii');
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return b;
}

describe('imageSize', () => {
  it('lit les dimensions d’un PNG', () => {
    expect(imageSize(mockImagePng('3:4'))).toEqual({ width: 576, height: 768 });
  });

  it('lit un vrai WebP (VP8 avec perte) du dépôt', () => {
    const file = readFileSync(
      join(
        process.cwd(),
        '..',
        'web',
        'public',
        'demos',
        'boutique-avant.webp',
      ),
    );
    expect(sniffImage(file)?.mime).toBe('image/webp');
    const size = imageSize(file)!;
    expect(size.width).toBeGreaterThan(100);
    expect(size.height).toBeGreaterThan(size.width); // portrait : 720 × 900 d'après l'image
    expect(size).toEqual({ width: 720, height: 900 });
  });

  it('lit les dimensions d’un JPEG, d’un WebP sans perte et d’un WebP étendu', () => {
    expect(imageSize(jpeg(864, 1152))).toEqual({ width: 864, height: 1152 });
    expect(imageSize(webpLossless(880, 1168))).toEqual({
      width: 880,
      height: 1168,
    });
    expect(imageSize(webpExtended(1536, 1024))).toEqual({
      width: 1536,
      height: 1024,
    });
  });

  it('renvoie null pour un fichier illisible ou tronqué', () => {
    expect(imageSize(Buffer.from('<html></html>'))).toBeNull();
    expect(imageSize(Buffer.alloc(0))).toBeNull();
    expect(imageSize(mockImagePng('1:1').subarray(0, 20))).toBeNull();
    expect(imageSize(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
  });
});

describe('checkOutput', () => {
  const rejects = (fn: () => unknown, code: string) => {
    try {
      fn();
    } catch (e) {
      expect(e).toBeInstanceOf(OutputRejectedError);
      expect((e as OutputRejectedError).failureCode).toBe(code);
      return;
    }
    throw new Error('aurait dû être refusé');
  };

  it('accepte une image aux proportions demandées et lit son type dans les octets', () => {
    expect(
      checkOutput(mockImagePng('16:9'), { isVideo: false, format: '16:9' }),
    ).toMatchObject({
      mime: 'image/png',
      ext: 'png',
      width: 768,
      height: 432,
    });
  });

  it.each(['1:1', '4:3', '3:2', '3:4', '2:3', '16:9', '9:16'])(
    'respecte le format %s',
    (format) => {
      expect(() =>
        checkOutput(mockImagePng(format), { isVideo: false, format }),
      ).not.toThrow();
    },
  );

  it('tolère les arrondis des modèles (880 × 1168 pour du 3:4) mais pas un autre format', () => {
    const rounded = Buffer.concat([webpLossless(880, 1168)]);
    expect(() =>
      checkOutput(rounded, { isVideo: false, format: '3:4' }),
    ).not.toThrow();
    rejects(
      () => checkOutput(mockImagePng('1:1'), { isVideo: false, format: '3:4' }),
      'FORMAT',
    );
    rejects(
      () =>
        checkOutput(mockImagePng('16:9'), { isVideo: false, format: '9:16' }),
      'FORMAT',
    );
  });

  it('refuse un fichier vide, une page d’erreur ou un type qui n’est pas une image', () => {
    rejects(
      () => checkOutput(Buffer.alloc(0), { isVideo: false, format: '1:1' }),
      'BAD_RESULT',
    );
    rejects(
      () =>
        checkOutput(Buffer.from('<html>Erreur</html>'.repeat(100)), {
          isVideo: false,
        }),
      'BAD_RESULT',
    );
    rejects(
      () => checkOutput(Buffer.alloc(5000, 0x41), { isVideo: false }),
      'BAD_RESULT',
    );
  });

  it('accepte un vrai MP4 et refuse tout le reste pour une vidéo', () => {
    const mp4 = readFileSync(join(process.cwd(), 'assets', 'mock-output.mp4'));
    expect(checkOutput(mp4, { isVideo: true })).toMatchObject({
      mime: 'video/mp4',
      ext: 'mp4',
    });
    rejects(
      () => checkOutput(Buffer.alloc(0), { isVideo: true }),
      'BAD_RESULT',
    );
    rejects(
      () => checkOutput(mockImagePng('9:16'), { isVideo: true }),
      'BAD_RESULT',
    );
    rejects(
      () => checkOutput(mp4.subarray(0, 4000), { isVideo: true }),
      'BAD_RESULT',
    );
    rejects(
      () => checkOutput(Buffer.from('x'.repeat(20_000)), { isVideo: true }),
      'BAD_RESULT',
    );
  });
});

describe('image simulée', () => {
  it('suit le format demandé, avec le grand côté à 768 px', () => {
    expect(mockImageDimensions('9:16')).toEqual({ width: 432, height: 768 });
    expect(mockImageDimensions('3:2')).toEqual({ width: 768, height: 512 });
    expect(mockImageDimensions('inconnu')).toEqual({ width: 768, height: 768 });
  });

  it('n’est jamais la photo de l’utilisateur : un motif de substitution, d’un type d’image valide', () => {
    const png = mockImagePng('1:1');
    expect(sniffImage(png)?.mime).toBe('image/png');
    expect(png.length).toBeGreaterThan(1000);
  });
});
