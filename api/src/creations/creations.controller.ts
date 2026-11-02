import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  CreateCreationInput,
  CreationPage,
  CreationView,
  ReportCreationInput,
  StyleView,
} from '@yamboka/shared';
import {
  CREATION_KINDS,
  MAX_UPLOAD_BYTES,
  createCreationSchema,
  reportCreationSchema,
} from '@yamboka/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CurrentUser, RequireVerifiedEmail } from '../common/decorators';
import type { AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { CreationsService, type UploadedImage } from './creations.service';

const stylesQuery = z.object({ kind: z.enum(CREATION_KINDS).optional() });
const listQuery = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  status: z.enum(['ready', 'running', 'failed']).optional(),
});
const fileQuery = z.object({
  variant: z.enum(['output', 'thumb']).default('output'),
  download: z.enum(['1']).optional(),
});

@ApiTags('creations')
@Controller('creations')
export class CreationsController {
  constructor(private readonly creations: CreationsService) {}

  @Get('styles')
  @ApiOperation({
    summary: 'Styles proposés, avec leur coût en crédits (calculé côté serveur)',
  })
  async styles(
    @Query(new ZodPipe(stylesQuery)) q: z.infer<typeof stylesQuery>,
  ): Promise<{ styles: StyleView[] }> {
    return { styles: await this.creations.listStyles(q.kind) };
  }

  @Get('styles/:id/thumbnail')
  @ApiOperation({ summary: 'Vignette d’un style' })
  async thumbnail(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { body, mime } = await this.creations.styleThumbnail(id);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(body);
  }

  @RequireVerifiedEmail()
  @Throttle({
    auth: { limit: 10, ttl: 60_000 },
    global: { limit: 20, ttl: 60_000 },
  })
  @Post()
  @UseInterceptors(
    FileInterceptor('photo', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }),
  )
  @ApiOperation({
    summary:
      'Lance une création (multipart : photo + choix). Les crédits sont réservés tout de suite et restitués en cas d’échec.',
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @UploadedFile() photo: UploadedImage | undefined,
    @Body(new ZodPipe(createCreationSchema)) body: CreateCreationInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ creation: CreationView }> {
    const creation = await this.creations.create(user.id, req.ip, photo, body);
    res.status(201);
    return { creation };
  }

  @Get()
  @ApiOperation({ summary: 'Mes créations, de la plus récente à la plus ancienne' })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>,
  ): Promise<CreationPage> {
    return this.creations.list(user.id, q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail et avancement d’une création' })
  async one(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ creation: CreationView }> {
    return { creation: await this.creations.get(user.id, id) };
  }

  @Get(':id/file')
  @ApiOperation({ summary: 'Résultat (ou aperçu) d’une création, réservé à son propriétaire' })
  async file(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(fileQuery)) q: z.infer<typeof fileQuery>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { body, mime, filename } = await this.creations.file(user.id, id, q.variant);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');
    if (q.download) {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }
    // Lecture par morceaux : indispensable pour avancer dans une vidéo sur mobile.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const size = body.length;
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', end - start + 1);
      res.end(body.subarray(start, end + 1));
      return;
    }
    res.send(body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprime une création et ses fichiers' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.creations.remove(user.id, id);
  }

  @Post(':id/report')
  @HttpCode(204)
  @Throttle({ global: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Signale un contenu' })
  async report(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reportCreationSchema)) body: ReportCreationInput,
  ): Promise<void> {
    await this.creations.report(user.id, id, body);
  }
}
