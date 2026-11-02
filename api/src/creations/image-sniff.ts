/** Type réel d'une image d'après ses premiers octets (le type annoncé par le navigateur ne prouve rien). */
export function sniffImage(
  buf: Buffer,
): { mime: 'image/jpeg' | 'image/png' | 'image/webp'; ext: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { mime: 'image/jpeg', ext: 'jpg' };
  if (
    buf.length >= 8 &&
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return { mime: 'image/png', ext: 'png' };
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
    return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/**
 * Dimensions réelles d'une image (PNG, JPEG, WebP) lues dans ses octets, sans la décoder. Sert à vérifier que le
 * résultat d'un fournisseur respecte le format demandé. Renvoie null si le fichier n'est pas lisible.
 */
export function imageSize(
  buf: Buffer,
): { width: number; height: number } | null {
  const type = sniffImage(buf);
  if (!type) return null;
  try {
    if (type.mime === 'image/png') {
      // IHDR : largeur et hauteur en entiers 32 bits, juste après la signature.
      if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR')
        return null;
      return ok(buf.readUInt32BE(16), buf.readUInt32BE(20));
    }
    if (type.mime === 'image/jpeg') {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) {
          i += 1;
          continue;
        }
        const marker = buf[i + 1];
        // Marqueurs SOF (hors DHT 0xC4, JPG 0xC8, DAC 0xCC) : contiennent hauteur puis largeur.
        if (
          marker >= 0xc0 &&
          marker <= 0xcf &&
          marker !== 0xc4 &&
          marker !== 0xc8 &&
          marker !== 0xcc
        ) {
          return ok(buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5));
        }
        if (
          marker === 0xd8 ||
          marker === 0x01 ||
          (marker >= 0xd0 && marker <= 0xd7)
        ) {
          i += 2;
          continue;
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
      return null;
    }
    // WebP : trois variantes (VP8 avec perte, VP8L sans perte, VP8X étendu).
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      return ok(buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1);
    }
    if (chunk === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return ok((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
    }
    if (chunk === 'VP8 ') {
      return ok(buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff);
    }
    return null;
  } catch {
    return null;
  }
}

function ok(width: number, height: number) {
  return width > 0 && height > 0 ? { width, height } : null;
}
