import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { Env } from '../config/env';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /**
   * Volontairement onApplicationShutdown et NON onModuleDestroy. Nest arrête l'application dans cet ordre :
   * onModuleDestroy → beforeApplicationShutdown → fermeture du serveur HTTP → onApplicationShutdown. Déconnectée
   * dès onModuleDestroy, la base disparaissait sous les requêtes et les tâches encore en cours, qui échouaient
   * au lieu d'aboutir. Ici la connexion survit au drain HTTP. Appelé aussi par app.close(), donc en test.
   *
   * Elle survit aussi à la fermeture des workers BullMQ, mais cela tient à un détail à ne pas casser : les
   * crochets d'arrêt s'exécutent par distance de module croissante, et tout module @Global() est à distance
   * maximale ; entre modules globaux, l'ordre est celui de l'enregistrement INVERSÉ. PrismaModule étant déclaré
   * AVANT QueueModule dans app.module.ts, il se ferme après lui. Inverser ces deux imports déconnecterait la
   * base avant la fin de la tâche en cours.
   */
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
