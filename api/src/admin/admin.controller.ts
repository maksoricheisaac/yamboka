import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';

/** Toutes les routes /admin/* exigent le rôle ADMIN, vérifié côté serveur (le proxy Next.js ne suffit pas). */
@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  @Get('ping')
  @ApiOperation({ summary: 'Contrôle d’accès administrateur' })
  ping(): { ok: true } {
    return { ok: true };
  }
}
