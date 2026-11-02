import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { EmailDiagnostic, EmailProvider } from './email.provider';
import {
  OtpKind,
  PurchaseReceipt,
  RenderedEmail,
  accountNoticeEmail,
  generationEmail,
  otpEmail,
  passwordResetEmail,
  purchaseEmail,
} from './templates';

/**
 * Envoi des e-mails destinés aux utilisateurs. Les méthodes LÈVENT en cas d'échec : c'est à l'appelant de décider
 * quoi dire à l'utilisateur. Rien n'est jamais présenté comme envoyé si le transport a échoué.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly provider: EmailProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private appUrl(path: string): string {
    return `${this.config.get('APP_URL', { infer: true })}${path}`;
  }

  private async send(to: string, mail: RenderedEmail): Promise<void> {
    await this.provider.send({ to, ...mail });
  }

  /** Notification d'événement (génération, paiement…) : LÈVE en cas d'échec, l'appelant gère la reprise. */
  sendNotificationEmail(to: string, mail: RenderedEmail): Promise<void> {
    return this.send(to, mail);
  }

  get providerName(): 'console' | 'smtp' {
    return this.provider.name;
  }

  diagnose(): Promise<EmailDiagnostic> {
    return this.provider.diagnose();
  }

  sendOtp(
    to: string,
    firstName: string | null,
    code: string,
    purpose: OtpKind,
    ttlMinutes: number,
  ): Promise<void> {
    return this.send(to, otpEmail(firstName, code, purpose, ttlMinutes));
  }

  sendPasswordReset(
    to: string,
    firstName: string,
    token: string,
  ): Promise<void> {
    return this.send(
      to,
      passwordResetEmail(
        firstName,
        this.appUrl(`/nouveau-mot-de-passe?token=${encodeURIComponent(token)}`),
      ),
    );
  }

  /** Confirmation d'achat et reçu. Meilleur effort : un échec d'e-mail ne doit jamais annuler un paiement validé. */
  async sendPurchaseConfirmation(
    to: string,
    firstName: string,
    receipt: PurchaseReceipt,
  ): Promise<void> {
    try {
      await this.send(
        to,
        purchaseEmail(firstName, receipt, this.appUrl('/app')),
      );
    } catch (e) {
      this.logger.error(
        `Confirmation d'achat non envoyée : ${e instanceof Error ? e.message : 'erreur'}`,
      );
    }
  }

  async sendGenerationResult(
    to: string,
    firstName: string,
    ok: boolean,
    refunded = true,
  ): Promise<void> {
    const url = this.appUrl('/app');
    try {
      await this.send(
        to,
        generationEmail(firstName, ok ? { ok, url } : { ok, refunded, url }),
      );
    } catch (e) {
      this.logger.error(
        `Notification de génération non envoyée : ${e instanceof Error ? e.message : 'erreur'}`,
      );
    }
  }

  async sendAccountNotice(
    to: string,
    firstName: string,
    title: string,
    message: string,
  ): Promise<void> {
    try {
      await this.send(to, accountNoticeEmail(firstName, title, message));
    } catch (e) {
      this.logger.error(
        `Notification de compte non envoyée : ${e instanceof Error ? e.message : 'erreur'}`,
      );
    }
  }

  /** Message de test (script et écran d'administration) : lève en cas d'échec. */
  sendTest(to: string): Promise<void> {
    return this.send(
      to,
      accountNoticeEmail(
        'administrateur',
        'Test de configuration e-mail',
        'Si vous lisez ce message, l’envoi d’e-mails depuis Yamboka fonctionne.',
      ),
    );
  }
}
