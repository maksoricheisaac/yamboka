import { INestApplication, Controller, Get, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RequireVerifiedEmail } from '../src/common/decorators';
import { configureApp } from '../src/configure-app';
import { ConsoleEmailProvider } from '../src/email/console-email.provider';
import { PrismaService } from '../src/prisma/prisma.service';

export const APP_ORIGIN = 'http://localhost:3001';
export const PASSWORD = 'Motdepasse-2026!';

/** Route de sonde : exige un e-mail vérifié (le guard est testé indépendamment des futurs achats). */
@Controller('probe')
class ProbeController {
  @Get('verified')
  @RequireVerifiedEmail()
  verified() {
    return { ok: true };
  }
}

export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [ProbeController as Type<unknown>],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

let ipSeed = Math.floor(Math.random() * 60000);
/** Adresse IP unique par client : la règle des crédits de bienvenue (RG-09) compte les comptes par IP. */
export function freshIp(): string {
  ipSeed += 1;
  return `10.${(ipSeed >> 8) & 255}.${ipSeed & 255}.${Math.floor(Math.random() * 250) + 1}`;
}

export const uniqueEmail = (prefix = 'user') =>
  `${prefix}.${randomUUID().slice(0, 8)}@example.com`;

export function signupBody(overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Jean',
    lastName: 'Mavoungou',
    email: uniqueEmail(),
    password: PASSWORD,
    confirmPassword: PASSWORD,
    acceptLegal: true,
    ...overrides,
  };
}

/** Client HTTP qui garde les cookies, comme un navigateur, et se présente depuis une IP donnée. */
export class Client {
  readonly agent;
  constructor(
    private readonly app: INestApplication,
    readonly ip = freshIp(),
  ) {
    this.agent = request.agent(app.getHttpServer());
  }

  private decorate(req: request.Test, origin: string | null = APP_ORIGIN) {
    req.set('X-Forwarded-For', this.ip);
    if (origin) req.set('Origin', origin);
    return req;
  }

  get(url: string) {
    return this.decorate(this.agent.get(url), null);
  }
  post(url: string, body?: object, origin: string | null = APP_ORIGIN) {
    return this.decorate(this.agent.post(url), origin).send(body);
  }
  patch(url: string, body?: object) {
    return this.decorate(this.agent.patch(url)).send(body);
  }
  delete(url: string, body?: object) {
    return this.decorate(this.agent.delete(url)).send(body);
  }

  async register(
    overrides: Record<string, unknown> = {},
  ): Promise<{ res: request.Response; email: string }> {
    const body = signupBody(overrides);
    const res = await this.post('/v1/auth/register', body);
    return { res, email: body.email };
  }
}

export function lastEmailFor(app: INestApplication, to: string) {
  const messages = app.get(ConsoleEmailProvider).messagesFor(to);
  return messages[messages.length - 1];
}

/** Extrait le jeton du dernier e-mail envoyé à cette adresse. */
export function tokenFromEmail(app: INestApplication, to: string): string {
  const mail = lastEmailFor(app, to);
  const match = mail?.text.match(/token=([A-Za-z0-9_%-]+)/);
  if (!match) throw new Error(`Aucun jeton dans l'e-mail envoyé à ${to}`);
  return decodeURIComponent(match[1]);
}

export const prismaOf = (app: INestApplication) => app.get(PrismaService);

/** Ouvre une session « brute » : renvoie le cookie tel que le navigateur l'enverrait, pour le rejouer à la main. */
export async function rawSession(app: INestApplication) {
  const body = signupBody();
  const res = await request(app.getHttpServer())
    .post('/v1/auth/register')
    .set('Origin', APP_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .send(body)
    .expect(201);
  const setCookie = res.headers['set-cookie'] as unknown as string[];
  const cookie = setCookie
    .find((c) => c.startsWith('yamboka_session='))!
    .split(';')[0];
  return { cookie, email: body.email };
}
