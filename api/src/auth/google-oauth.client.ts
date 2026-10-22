import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  givenName?: string;
  familyName?: string;
  name?: string;
  picture?: string;
}

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

/** Client OAuth 2.0 (code d'autorisation + PKCE). Isolé pour pouvoir être simulé dans les tests. */
@Injectable()
export class GoogleOAuthClient {
  constructor(private readonly config: ConfigService<Env, true>) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get('GOOGLE_CLIENT_ID', { infer: true }) &&
      this.config.get('GOOGLE_CLIENT_SECRET', { infer: true }) &&
      this.config.get('GOOGLE_CALLBACK_URL', { infer: true }),
    );
  }

  private required() {
    const clientId = this.config.get('GOOGLE_CLIENT_ID', { infer: true });
    const clientSecret = this.config.get('GOOGLE_CLIENT_SECRET', {
      infer: true,
    });
    const redirectUri = this.config.get('GOOGLE_CALLBACK_URL', { infer: true });
    if (!clientId || !clientSecret || !redirectUri) {
      throw new ServiceUnavailableException({
        code: 'GOOGLE_NOT_CONFIGURED',
        message:
          'La connexion avec Google n’est pas disponible pour le moment.',
      });
    }
    return { clientId, clientSecret, redirectUri };
  }

  buildAuthUrl(state: string, codeChallenge: string): string {
    const { clientId, redirectUri } = this.required();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async fetchProfile(
    code: string,
    codeVerifier: string,
  ): Promise<GoogleProfile> {
    const { clientId, clientSecret, redirectUri } = this.required();

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!tokenRes.ok)
      throw new Error(`Échange du code Google refusé (${tokenRes.status})`);
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token)
      throw new Error('Réponse Google sans jeton d’accès');

    const infoRes = await fetch(USERINFO_URL, {
      headers: { authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!infoRes.ok)
      throw new Error(`Profil Google indisponible (${infoRes.status})`);
    const info = (await infoRes.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      given_name?: string;
      family_name?: string;
      name?: string;
      picture?: string;
    };
    if (!info.sub || !info.email) throw new Error('Profil Google incomplet');
    return {
      sub: info.sub,
      email: info.email.toLowerCase(),
      emailVerified: info.email_verified === true,
      givenName: info.given_name,
      familyName: info.family_name,
      name: info.name,
      picture: info.picture,
    };
  }
}
