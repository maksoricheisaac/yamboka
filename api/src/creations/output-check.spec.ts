import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sniffImage } from './image-sniff';
import { checkOutput, OutputRejectedError } from './output-check';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const rejects = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(OutputRejectedError);
    expect((e as OutputRejectedError).failureCode).toBe(code);
    return;
  }
  throw new Error('Aucun refus levé.');
};

describe('sniffImage (photo envoyée par l’utilisateur)', () => {
  it('reconnaît JPEG, PNG et WebP d’après les octets', () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe(
      'image/jpeg',
    );
    expect(sniffImage(PNG_SIGNATURE)?.mime).toBe('image/png');
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
  });

  it('refuse un fichier qui n’est pas une photo', () => {
    expect(sniffImage(Buffer.from('<html></html>'))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});

describe('checkOutput (résultat du fournisseur)', () => {
  const mp4 = readFileSync(join(process.cwd(), 'assets', 'mock-output.mp4'));

  it('accepte un vrai MP4', () => {
    expect(checkOutput(mp4)).toEqual({ mime: 'video/mp4', ext: 'mp4' });
  });

  it('refuse un fichier vide, une image, un MP4 tronqué ou une page d’erreur', () => {
    rejects(() => checkOutput(Buffer.alloc(0)), 'BAD_RESULT');
    rejects(
      () => checkOutput(Buffer.concat([PNG_SIGNATURE, Buffer.alloc(20_000)])),
      'BAD_RESULT',
    );
    rejects(() => checkOutput(mp4.subarray(0, 4000)), 'BAD_RESULT');
    rejects(() => checkOutput(Buffer.from('x'.repeat(20_000))), 'BAD_RESULT');
  });
});
