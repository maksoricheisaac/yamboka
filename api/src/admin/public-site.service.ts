import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

/**
 * Prévient le site public qu'une offre a changé (packs, produits) pour qu'il recharge ses prix tout de suite.
 * Meilleur effort : la modification est déjà enregistrée, et le site public se rafraîchit de toute façon à
 * l'expiration de son cache (quelques minutes). Un échec n'annule donc jamais l'opération d'administration.
 */
@Injectable()
export class PublicSiteService {
  private readonly logger = new Logger(PublicSiteService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async refreshOffers(): Promise<void> {
    const secret = this.config.get('REVALIDATE_SECRET', { infer: true });
    if (!secret) return;
    try {
      const res = await fetch(
        `${this.config.get('WEB_URL', { infer: true })}/api/revalidate`,
        {
          method: 'POST',
          headers: { 'x-revalidate-secret': secret },
          signal: AbortSignal.timeout(3000),
        },
      );
      if (!res.ok) {
        this.logger.warn(`Rafraîchissement du site public refusé (${res.status}).`);
      }
    } catch {
      this.logger.warn('Site public injoignable : offres rafraîchies à l’expiration du cache.');
    }
  }
}
