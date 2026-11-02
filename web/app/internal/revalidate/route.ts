import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';

/**
 * Appelé par l'API après une modification d'offre (packs, produits) : les prix publics sont rechargés
 * immédiatement. Protégé par un secret partagé ; désactivé (503) tant que REVALIDATE_SECRET n'est pas défini.
 */
export async function POST(request: Request) {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected) return Response.json({ error: 'disabled' }, { status: 503 });

  const given = Buffer.from(request.headers.get('x-revalidate-secret') ?? '');
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  revalidateTag('offers', { expire: 0 });
  return Response.json({ revalidated: true });
}
