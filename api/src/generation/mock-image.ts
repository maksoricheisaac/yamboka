import { deflateSync } from 'node:zlib';

/**
 * Image de substitution du fournisseur SIMULÉ : un motif sans rapport avec la photo de l'utilisateur, portant
 * clairement la mention « SIMULATION ». Le simulé ne doit jamais faire passer la photo d'origine (ni rien
 * d'autre) pour une création de l'IA. Les proportions suivent le format demandé, ce qui permet de tester les
 * formats sans fournisseur réel. PNG écrit à la main (aucune dépendance).
 */

// Police 5 × 7 : seulement les lettres des deux mentions.
const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
};

const CRC_TABLE = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Dimensions d'un format « L:H » dont le grand côté vaut `longSide` pixels. */
export function mockImageDimensions(
  format: string,
  longSide = 768,
): { width: number; height: number } {
  const [w, h] = format.split(':').map(Number);
  if (!w || !h) return { width: longSide, height: longSide };
  return w >= h
    ? { width: longSide, height: Math.round((longSide * h) / w) }
    : { width: Math.round((longSide * w) / h), height: longSide };
}

export function mockImagePng(format: string): Buffer {
  const { width, height } = mockImageDimensions(format);
  const rows = Buffer.alloc((width * 3 + 1) * height);
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * (width * 3 + 1) + 1 + x * 3;
    rows[i] = r;
    rows[i + 1] = g;
    rows[i + 2] = b;
  };
  // Fond dégradé et bandes diagonales : un motif manifestement artificiel.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const stripe = Math.floor((x + y) / 28) % 2 === 0;
      const t = y / height;
      const base = [40 + 60 * t, 30 + 20 * t, 90 + 80 * t];
      const k = stripe ? 1 : 0.78;
      put(x, y, base[0] * k, base[1] * k, base[2] * k);
    }
  }
  const text = (
    s: string,
    cx: number,
    cy: number,
    px: number,
    color: number[],
  ) => {
    const advance = 6 * px;
    const x0 = Math.round(cx - (s.length * advance - px) / 2);
    [...s].forEach((ch, i) => {
      const g = GLYPHS[ch];
      if (!g) return;
      g.forEach((line, gy) =>
        [...line].forEach((bit, gx) => {
          if (bit !== '1') return;
          for (let dy = 0; dy < px; dy++)
            for (let dx = 0; dx < px; dx++)
              put(
                x0 + i * advance + gx * px + dx,
                cy - 3.5 * px + gy * px + dy,
                color[0],
                color[1],
                color[2],
              );
        }),
      );
    });
  };
  const big = Math.max(3, Math.floor(width / 60));
  const small = Math.max(2, Math.floor(big / 2));
  text('SIMULATION', width / 2, height / 2 - big * 6, big, [255, 255, 255]);
  text(
    'AUCUNE IA UTILISEE',
    width / 2,
    height / 2 + big * 4,
    small,
    [255, 220, 120],
  );

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 2; // RVB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
