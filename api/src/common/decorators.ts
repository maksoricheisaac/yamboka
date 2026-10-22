import {
  ExecutionContext,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../generated/prisma/client';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';
export const REQUIRE_VERIFIED_EMAIL = 'requireVerifiedEmail';

/** Route accessible sans session. Toute route est protégée par défaut. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Restreint la route à certains rôles (vérifié côté serveur). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
/** Exige une adresse e-mail vérifiée (achat de crédits, génération). */
export const RequireVerifiedEmail = () =>
  SetMetadata(REQUIRE_VERIFIED_EMAIL, true);

export interface AuthUser {
  id: string;
  role: Role;
  emailVerified: boolean;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user)
      throw new Error('CurrentUser utilisé sur une route publique');
    return req.user;
  },
);

export const ClientIp = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    return ctx.switchToHttp().getRequest<Request>().ip;
  },
);
