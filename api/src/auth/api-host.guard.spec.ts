import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { SESSION_COOKIE } from '@yamboka/shared';
import type { Env } from '../config/env';
import { ApiHostGuard } from './api-host.guard';

function guard(urls: { api: string; app: string; web: string }) {
  const config = {
    get: (key: string) =>
      ({ API_URL: urls.api, APP_URL: urls.app, WEB_URL: urls.web })[key],
  } as unknown as ConfigService<Env, true>;
  return new ApiHostGuard(config);
}

function ctx(headers: Record<string, string>, cookie: boolean) {
  const req = {
    headers,
    cookies: cookie ? { [SESSION_COOKIE]: 'token' } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const prod = {
  api: 'https://api.yamboka.com',
  app: 'https://app.yamboka.com',
  web: 'https://yamboka.com',
};

describe('ApiHostGuard', () => {
  it('refuse un cookie de session sur l’hôte API (Host)', () => {
    expect(() =>
      guard(prod).canActivate(ctx({ host: 'api.yamboka.com' }, true)),
    ).toThrow(ForbiddenException);
  });

  it('refuse aussi via X-Forwarded-Host, sans tenir compte de la casse ni du port', () => {
    expect(() =>
      guard(prod).canActivate(
        ctx(
          { host: 'api-prod:4000', 'x-forwarded-host': 'API.Yamboka.com:443' },
          true,
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  it('laisse passer sans cookie : webhooks et intégrations serveur à serveur', () => {
    expect(
      guard(prod).canActivate(ctx({ host: 'api.yamboka.com' }, false)),
    ).toBe(true);
  });

  it('laisse passer un cookie sur l’hôte de l’application, y compris via le relais interne', () => {
    expect(
      guard(prod).canActivate(ctx({ host: 'app.yamboka.com' }, true)),
    ).toBe(true);
    expect(guard(prod).canActivate(ctx({ host: 'api-prod:4000' }, true))).toBe(
      true,
    );
  });

  it('est sans effet quand l’hôte d’API est celui du front (développement local)', () => {
    const local = guard({
      api: 'http://localhost:4000',
      app: 'http://localhost:3001',
      web: 'http://localhost:3000',
    });
    expect(local.canActivate(ctx({ host: 'localhost:4000' }, true))).toBe(true);
  });
});
