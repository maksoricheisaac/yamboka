import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  ChangePasswordInput,
  DeleteAccountInput,
  SessionInfo,
  SessionUser,
  UpdateProfileInput,
} from '@yamboka/shared';
import {
  changePasswordSchema,
  deleteAccountSchema,
  updateProfileSchema,
} from '@yamboka/shared';
import type { Response } from 'express';
import { SessionService } from '../auth/session.service';
import { ClientIp, CurrentUser } from '../common/decorators';
import type { AuthUser } from '../common/decorators';
import { jsonSchema } from '../common/json-schema';
import { ZodPipe } from '../common/zod.pipe';
import { UsersService } from './users.service';

/** « Chrome sur Windows » à partir de l'agent utilisateur ; « Appareil inconnu » si rien d'exploitable. */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Appareil inconnu';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : null;
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iOS/.test(userAgent)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  if (browser && os) return `${browser} sur ${os}`;
  return browser ?? os ?? 'Appareil inconnu';
}

@ApiTags('users')
@Controller('me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionService,
  ) {}

  @Patch()
  @ApiOperation({
    summary: 'Modifie le profil (prénom, nom, téléphone uniquement)',
  })
  @ApiBody({ schema: jsonSchema(updateProfileSchema) })
  async update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<{ user: SessionUser }> {
    return { user: await this.users.updateProfile(user.id, body) };
  }

  @Throttle({
    auth: { limit: 5, ttl: 60_000 },
    global: { limit: 30, ttl: 60_000 },
  })
  @HttpCode(200)
  @Post('password')
  @ApiOperation({
    summary: 'Change le mot de passe (déconnecte les autres appareils)',
  })
  @ApiBody({ schema: jsonSchema(changePasswordSchema) })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(changePasswordSchema)) body: ChangePasswordInput,
  ): Promise<{ message: string }> {
    await this.users.changePassword(user.id, user.sessionId, body);
    return { message: 'Votre mot de passe a été modifié.' };
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Appareils actuellement connectés à mon compte' })
  async listSessions(
    @CurrentUser() user: AuthUser,
  ): Promise<{ sessions: SessionInfo[] }> {
    const rows = await this.sessions.listActive(user.id);
    return {
      sessions: rows.map((s) => ({
        id: s.id,
        current: s.id === user.sessionId,
        device: describeDevice(s.userAgent),
        createdAt: s.createdAt.toISOString(),
      })),
    };
  }

  @HttpCode(200)
  @Post('sessions/revoke-others')
  @ApiOperation({
    summary:
      'Déconnecte tous mes autres appareils (la session courante reste ouverte)',
  })
  async revokeOtherSessions(
    @CurrentUser() user: AuthUser,
  ): Promise<{ message: string }> {
    await this.sessions.revokeAll(user.id, user.sessionId);
    return { message: 'Vos autres appareils ont été déconnectés.' };
  }

  @HttpCode(200)
  @Post('legal-acceptances')
  @ApiOperation({
    summary: 'Accepte les dernières versions des conditions et de la charte',
  })
  async acceptLegal(
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string | undefined,
  ): Promise<{ user: SessionUser }> {
    return { user: await this.users.acceptLegal(user.id, ip) };
  }

  @Throttle({
    auth: { limit: 3, ttl: 60_000 },
    global: { limit: 10, ttl: 60_000 },
  })
  @HttpCode(200)
  @Delete()
  @ApiOperation({
    summary: 'Supprime le compte (anonymisation ; traces légales conservées)',
  })
  @ApiBody({ schema: jsonSchema(deleteAccountSchema) })
  async remove(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(deleteAccountSchema)) body: DeleteAccountInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    await this.users.deleteAccount(user.id, body);
    this.sessions.clearCookie(res);
    return { message: 'Votre compte a été supprimé.' };
  }
}
