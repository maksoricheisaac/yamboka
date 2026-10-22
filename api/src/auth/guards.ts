import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { SESSION_COOKIE } from '@yamboka/shared';
import type { Request } from 'express';
import {
  AuthenticatedRequest,
  IS_PUBLIC,
  REQUIRE_VERIFIED_EMAIL,
  ROLES,
} from '../common/decorators';
import type { Env } from '../config/env';
import type { Role } from '../generated/prisma/client';
import { SessionService } from './session.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protection CSRF : une requête qui modifie des données et porte un cookie de session doit venir
 * d'une origine autorisée (en complément de SameSite=Lax).
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: Set<string>;

  constructor(config: ConfigService<Env, true>) {
    this.allowed = new Set([
      new URL(config.get('APP_URL', { infer: true })).origin,
      new URL(config.get('WEB_URL', { infer: true })).origin,
    ]);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = req.headers.origin;
    const hasSession = Boolean(
      (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE],
    );
    if (origin ? !this.allowed.has(origin) : hasSession) {
      throw new ForbiddenException({
        code: 'CSRF_REJECTED',
        message: 'Requête refusée : origine non autorisée.',
      });
    }
    return true;
  }
}

/** Authentifie la session, applique le statut du compte et l'exigence d'e-mail vérifié. Refus par défaut. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets))
      return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = (req.cookies as Record<string, string> | undefined)?.[
      SESSION_COOKIE
    ];
    const session = token ? await this.sessions.findValid(token) : null;
    if (!session) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Connexion requise.',
      });
    }

    const { user } = session;
    if (user.status === 'BANNED') {
      throw new ForbiddenException({
        code: 'ACCOUNT_BANNED',
        message: 'Ce compte a été banni.',
      });
    }
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Ce compte est suspendu temporairement.',
      });
    }

    req.user = {
      id: user.id,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
      sessionId: session.id,
    };

    if (
      this.reflector.getAllAndOverride<boolean>(
        REQUIRE_VERIFIED_EMAIL,
        targets,
      ) &&
      !req.user.emailVerified
    ) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Vérifiez votre adresse e-mail pour effectuer cette action.',
      });
    }
    return true;
  }
}

/** Contrôle d'accès par rôle, toujours côté serveur. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user || !roles.includes(req.user.role)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Accès refusé.',
      });
    }
    return true;
  }
}
