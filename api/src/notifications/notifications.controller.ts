import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  updatePreferencesSchema,
  type NotificationKind,
  type NotificationPage,
  type PreferencesView,
  type UpdatePreferencesInput,
} from '@yamboka/shared';
import { z } from 'zod';
import { CurrentUser } from '../common/decorators';
import type { AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService, resolvePrefs } from './notifications.service';

const listQuery = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/** Chaque requête est bornée à l'utilisateur connecté : on ne lit ni ne modifie jamais la notification d'un autre. */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Mes notifications, de la plus récente à la plus ancienne' })
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>,
  ): Promise<NotificationPage> {
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      }),
      this.prisma.notification.count({
        where: { userId: user.id, readAt: null },
      }),
    ]);
    const page = rows.slice(0, q.limit);
    return {
      unread,
      nextCursor: rows.length > q.limit ? page[page.length - 1].id : null,
      items: page.map((n) => ({
        id: n.id,
        type: n.type as NotificationKind,
        title: n.title,
        body: n.body,
        link: n.link,
        read: n.readAt !== null,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  }

  @Post('read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Marque toutes mes notifications comme lues' })
  async markAllRead(@CurrentUser() user: AuthUser): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  }

  @Post(':id/read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Marque une de mes notifications comme lue' })
  async markRead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const res = await this.prisma.notification.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (res.count === 0) {
      const exists = await this.prisma.notification.count({
        where: { id, userId: user.id },
      });
      if (!exists) throw new NotFoundException();
    }
  }
}

@ApiTags('preferences')
@Controller('preferences')
export class PreferencesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async view(userId: string): Promise<PreferencesView> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { emailPrefs: true, email: true, emailVerifiedAt: true },
    });
    return {
      emailPrefs: resolvePrefs(u.emailPrefs),
      email: u.email,
      emailVerified: u.emailVerifiedAt !== null,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Mes préférences (e-mails par événement)' })
  async get(@CurrentUser() user: AuthUser): Promise<PreferencesView> {
    return this.view(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Modifie mes préférences ; renvoie les valeurs réellement enregistrées' })
  async update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(updatePreferencesSchema)) body: UpdatePreferencesInput,
  ): Promise<PreferencesView> {
    const merged = { ...(await this.notifications.getPrefs(user.id)), ...body.emailPrefs };
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailPrefs: merged },
    });
    return this.view(user.id);
  }
}
