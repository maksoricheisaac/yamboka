import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SessionUser,
  SignupInput,
  VerifyEmailInput,
} from '@yamboka/shared';
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from '@yamboka/shared';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { jsonSchema } from '../common/json-schema';
import { ClientIp, CurrentUser, Public } from '../common/decorators';
import type { AuthUser, AuthenticatedRequest } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { Env } from '../config/env';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { GoogleOAuthClient } from './google-oauth.client';
import { SessionService } from './session.service';
import { randomToken, safeEqual } from './tokens';

const OAUTH_STATE_COOKIE = 'yamboka_oauth_state';
const OAUTH_VERIFIER_COOKIE = 'yamboka_oauth_verifier';

/** Limites strictes sur les opérations sensibles : par IP et par couple IP + e-mail (UF-09). */
const STRICT = {
  auth: { limit: 5, ttl: 60_000 },
  global: { limit: 30, ttl: 60_000 },
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly google: GoogleOAuthClient,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private ctx(req: Request, ip?: string) {
    return { ip, userAgent: req.headers['user-agent'] };
  }

  @Public()
  @Throttle(STRICT)
  @Post('register')
  @ApiOperation({ summary: 'Inscription par e-mail et mot de passe' })
  @ApiBody({ schema: jsonSchema(signupSchema) })
  async register(
    @Body(new ZodPipe(signupSchema)) body: SignupInput,
    @Req() req: Request,
    @ClientIp() ip: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: SessionUser }> {
    const result = await this.auth.register(body, this.ctx(req, ip));
    this.sessions.setCookie(
      res,
      result.session.token,
      result.session.expiresAt,
    );
    res.status(201);
    return { user: await this.users.toSessionUser(result.userId) };
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('login')
  @ApiOperation({ summary: 'Connexion par e-mail et mot de passe' })
  @ApiBody({ schema: jsonSchema(loginSchema) })
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @ClientIp() ip: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: SessionUser }> {
    const result = await this.auth.login(body, this.ctx(req, ip));
    this.sessions.setCookie(
      res,
      result.session.token,
      result.session.expiresAt,
    );
    return { user: await this.users.toSessionUser(result.userId) };
  }

  @HttpCode(200)
  @Post('logout')
  @ApiOperation({ summary: 'Déconnexion (révoque la session)' })
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    await this.sessions.revoke(user.sessionId);
    this.sessions.clearCookie(res);
    return { message: 'Vous êtes déconnecté.' };
  }

  @Get('me')
  @ApiOperation({ summary: 'Utilisateur connecté, solde de crédits inclus' })
  async me(@CurrentUser() user: AuthUser): Promise<{ user: SessionUser }> {
    return { user: await this.users.toSessionUser(user.id) };
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('verify-email')
  @ApiOperation({
    summary: 'Valide l’adresse e-mail avec le lien reçu (24 h, usage unique)',
  })
  @ApiBody({ schema: jsonSchema(verifyEmailSchema) })
  async verifyEmail(
    @Body(new ZodPipe(verifyEmailSchema)) body: VerifyEmailInput,
  ): Promise<{ message: string }> {
    await this.auth.verifyEmail(body.token);
    return { message: 'Votre adresse e-mail est confirmée.' };
  }

  @Throttle({
    auth: { limit: 3, ttl: 60_000 },
    global: { limit: 10, ttl: 60_000 },
  })
  @HttpCode(200)
  @Post('resend-verification')
  @ApiOperation({
    summary: 'Renvoie le lien de vérification de l’adresse e-mail',
  })
  async resend(@CurrentUser() user: AuthUser): Promise<{ message: string }> {
    const outcome = await this.auth.resendVerification(user.id);
    return {
      message:
        outcome === 'already_verified'
          ? 'Votre adresse e-mail est déjà confirmée.'
          : 'Un nouveau lien vous a été envoyé.',
    };
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('forgot-password')
  @ApiOperation({
    summary:
      'Envoie un lien de réinitialisation (réponse identique si l’adresse est inconnue)',
  })
  @ApiBody({ schema: jsonSchema(forgotPasswordSchema) })
  async forgot(
    @Body(new ZodPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
  ): Promise<{ message: string }> {
    await this.auth.forgotPassword(body);
    return {
      message:
        'Si un compte existe pour cette adresse, un lien de réinitialisation vient d’être envoyé.',
    };
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('reset-password')
  @ApiOperation({
    summary:
      'Définit un nouveau mot de passe avec le lien reçu (1 h, usage unique)',
  })
  @ApiBody({ schema: jsonSchema(resetPasswordSchema) })
  async reset(
    @Body(new ZodPipe(resetPasswordSchema)) body: ResetPasswordInput,
  ): Promise<{ message: string }> {
    await this.auth.resetPassword(body);
    return {
      message: 'Votre mot de passe a été modifié. Vous pouvez vous connecter.',
    };
  }

  // ───────────── Google OAuth 2.0 ─────────────

  @Public()
  @Get('providers')
  @ApiOperation({
    summary: 'Méthodes de connexion disponibles (affichage du bouton Google)',
  })
  providers(): { google: boolean } {
    return { google: this.google.isConfigured() };
  }

  @Public()
  @Get('google')
  @ApiOperation({ summary: 'Démarre la connexion avec Google (redirection)' })
  googleStart(@Res() res: Response): void {
    if (!this.google.isConfigured()) {
      throw new ServiceUnavailableException({
        code: 'GOOGLE_NOT_CONFIGURED',
        message:
          'La connexion avec Google n’est pas disponible pour le moment.',
      });
    }
    const state = randomToken(24);
    const verifier = randomToken(48);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const opts = {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax' as const,
      maxAge: 10 * 60 * 1000,
      path: '/',
    };
    res.cookie(OAUTH_STATE_COOKIE, state, opts);
    res.cookie(OAUTH_VERIFIER_COOKIE, verifier, opts);
    res.redirect(this.google.buildAuthUrl(state, challenge));
  }

  @Public()
  @Get('google/callback')
  @ApiOperation({
    summary:
      'Retour de Google : vérifie le state, crée ou relie le compte, ouvre la session',
  })
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: AuthenticatedRequest,
    @ClientIp() ip: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const appUrl = this.config.get('APP_URL', { infer: true });
    const fail = (reason: string) =>
      res.redirect(`${appUrl}/connexion?erreur=${reason}`);
    const cookies = req.cookies as Record<string, string | undefined>;
    const savedState = cookies[OAUTH_STATE_COOKIE];
    const verifier = cookies[OAUTH_VERIFIER_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });
    res.clearCookie(OAUTH_VERIFIER_COOKIE, { path: '/' });

    if (error) return fail('google_refuse');
    // Le paramètre state protège contre l'usurpation de la redirection (CSRF OAuth).
    if (
      !code ||
      !state ||
      !savedState ||
      !verifier ||
      !safeEqual(state, savedState)
    ) {
      return fail('google_etat');
    }

    try {
      const profile = await this.google.fetchProfile(code, verifier);
      const result = await this.auth.loginWithGoogle(
        profile,
        this.ctx(req, ip),
      );
      this.sessions.setCookie(
        res,
        result.session.token,
        result.session.expiresAt,
      );
      res.redirect(`${appUrl}/app`);
    } catch (e) {
      const code = (
        e as { getResponse?: () => { code?: string } }
      ).getResponse?.()?.code;
      if (code === 'ACCOUNT_BANNED' || code === 'ACCOUNT_SUSPENDED')
        return fail('compte_suspendu');
      if (code === 'GOOGLE_EMAIL_UNVERIFIED') return fail('google_email');
      return fail('google');
    }
  }
}
