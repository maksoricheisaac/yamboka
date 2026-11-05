import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESSION_COOKIE } from '@yamboka/shared';
import type { Request } from 'express';
import type { Env } from '../config/env';

/** Nom d'hôte sans port, en minuscules, depuis un en-tête Host / X-Forwarded-Host (qui peut en lister plusieurs). */
function hostnameOf(header: string | string[] | undefined): string | null {
  const first = (Array.isArray(header) ? header[0] : header)
    ?.split(',')[0]
    ?.trim();
  if (!first) return null;
  try {
    return new URL(`http://${first}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Hôte d'API publique dédié (ex. api.yamboka.com) : webhooks et intégrations serveur à serveur uniquement.
 * Le navigateur n'y parle jamais (il passe par /api sur l'hôte de l'application) et le cookie de session, limité
 * à l'hôte, n'y est jamais envoyé légitimement. Une requête qui en porte un malgré tout (cookie recopié, client
 * mal configuré) est refusée plutôt que de bénéficier silencieusement d'une session.
 *
 * Sans effet quand l'hôte d'API est aussi celui du site ou de l'application (développement local, tests) :
 * le relais /api de Next.js y arrive avec le nom d'hôte de l'API et doit garder ses sessions.
 * Les webhooks et les appels sans cookie ne sont jamais concernés.
 */
@Injectable()
export class ApiHostGuard implements CanActivate {
  private readonly apiHost: string | null;

  constructor(config: ConfigService<Env, true>) {
    const host = new URL(config.get('API_URL', { infer: true })).hostname;
    const frontHosts = [
      config.get('APP_URL', { infer: true }),
      config.get('WEB_URL', { infer: true }),
    ].map((url) => new URL(url).hostname.toLowerCase());
    const apiHost = host.toLowerCase();
    this.apiHost = frontHosts.includes(apiHost) ? null : apiHost;
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.apiHost) return true;
    const req = context.switchToHttp().getRequest<Request>();
    const cookies = req.cookies as Record<string, string> | undefined;
    if (!cookies?.[SESSION_COOKIE]) return true;

    // L'en-tête Host d'origine ET X-Forwarded-Host (posé par Traefik) : l'un ou l'autre suffit à identifier l'hôte API.
    const onApiHost =
      hostnameOf(req.headers.host) === this.apiHost ||
      hostnameOf(req.headers['x-forwarded-host']) === this.apiHost;
    if (onApiHost) {
      throw new ForbiddenException({
        code: 'SESSION_NOT_ALLOWED_ON_API_HOST',
        message:
          'Les sessions ne sont pas acceptées sur ce domaine : utilisez l’application.',
      });
    }
    return true;
  }
}
