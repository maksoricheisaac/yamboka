import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  SessionUser,
  SetupAdminInput,
  SetupDiagnostic,
  SetupStatus,
  SetupSummary,
} from '@yamboka/shared';
import { SETUP_SECRET_HEADER, setupAdminSchema } from '@yamboka/shared';
import type { Request, Response } from 'express';
import { SessionService } from '../auth/session.service';
import { ClientIp, Public } from '../common/decorators';
import { jsonSchema } from '../common/json-schema';
import { ZodPipe } from '../common/zod.pipe';
import { UsersService } from '../users/users.service';
import { SetupService } from './setup.service';

const STRICT = {
  auth: { limit: 8, ttl: 60_000 },
  global: { limit: 20, ttl: 60_000 },
};

/** Routes publiques mais fermées par SETUP_SECRET, puis verrouillées définitivement une fois l'installation faite. */
@ApiTags('setup')
@Controller('setup')
export class SetupController {
  constructor(
    private readonly setup: SetupService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Get('status')
  @ApiOperation({
    summary: 'Installation faite ou non (aucune information sensible)',
  })
  status(): Promise<SetupStatus> {
    return this.setup.status();
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('check')
  @ApiOperation({
    summary: 'Diagnostic de l’installation (exige le secret d’installation)',
  })
  async check(
    @Headers(SETUP_SECRET_HEADER) secret: string | undefined,
  ): Promise<SetupDiagnostic> {
    await this.setup.authorize(secret);
    return this.setup.diagnose();
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(201)
  @Post('complete')
  @ApiOperation({
    summary:
      'Crée le premier administrateur et verrouille l’assistant (une seule fois)',
  })
  @ApiBody({ schema: jsonSchema(setupAdminSchema) })
  async complete(
    @Headers(SETUP_SECRET_HEADER) secret: string | undefined,
    @Body(new ZodPipe(setupAdminSchema)) body: SetupAdminInput,
    @Req() req: Request,
    @ClientIp() ip: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: SessionUser; summary: SetupSummary }> {
    await this.setup.authorize(secret);
    const result = await this.setup.complete(body, {
      ip,
      userAgent: req.headers['user-agent'],
    });
    this.sessions.setCookie(
      res,
      result.session.token,
      result.session.expiresAt,
    );
    return {
      user: await this.users.toSessionUser(result.userId),
      summary: result.summary,
    };
  }
}
