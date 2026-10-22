import { Injectable } from '@nestjs/common';
import type { NotificationType, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(
    db: Db,
    n: {
      userId: string;
      type: NotificationType;
      title: string;
      body: string;
      link?: string;
    },
  ) {
    return db.notification.create({ data: n });
  }
}
