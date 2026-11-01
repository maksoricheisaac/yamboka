import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../config/env';
import {
  EmailDeliveryError,
  EmailDiagnostic,
  EmailFailureReason,
  EmailMessage,
  EmailProvider,
} from './email.provider';

/** Classe l'erreur du transport sans jamais en reprendre le texte (qui peut contenir l'hôte ou l'identifiant). */
function classify(e: unknown): EmailFailureReason {
  const err = e as { code?: string; responseCode?: number };
  if (err.code === 'EAUTH' || err.responseCode === 535) return 'auth';
  if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKET') return 'timeout';
  if (
    err.code === 'ECONNECTION' ||
    err.code === 'ECONNREFUSED' ||
    err.code === 'ENOTFOUND'
  )
    return 'connection';
  if (err.code === 'EENVELOPE' || (err.responseCode && err.responseCode >= 500))
    return 'rejected';
  return 'unknown';
}

const DETAIL: Record<EmailFailureReason, string> = {
  not_configured: 'Configuration SMTP incomplète.',
  auth: 'Identifiants SMTP refusés (SMTP_USER / SMTP_PASSWORD).',
  connection:
    'Connexion au serveur SMTP impossible (SMTP_HOST, SMTP_PORT, pare-feu).',
  timeout: 'Le serveur SMTP ne répond pas dans le délai imparti.',
  rejected:
    'Message refusé par le serveur : vérifiez que EMAIL_FROM correspond à un domaine autorisé.',
  unknown: 'Erreur SMTP inattendue.',
};

@Injectable()
export class SmtpEmailProvider extends EmailProvider {
  readonly name = 'smtp' as const;
  private readonly logger = new Logger('Email');
  private readonly transport: Transporter;
  private readonly from: string;
  private readonly replyTo?: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    const secure = config.get('SMTP_SECURE', { infer: true }) === 'true';
    this.from = config.get('EMAIL_FROM', { infer: true });
    this.replyTo = config.get('EMAIL_REPLY_TO', { infer: true });
    this.transport = createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      secure,
      // Sans TLS implicite, le chiffrement STARTTLS est obligatoire (jamais d'envoi en clair).
      requireTLS: !secure,
      auth: {
        user: config.get('SMTP_USER', { infer: true }),
        pass: config.get('SMTP_PASSWORD', { infer: true }),
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.from,
        replyTo: this.replyTo || undefined,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (e) {
      const reason = classify(e);
      this.logger.error(`Envoi SMTP échoué (${reason}) — ${message.subject}`);
      throw new EmailDeliveryError(reason);
    }
  }

  async diagnose(): Promise<EmailDiagnostic> {
    try {
      await this.transport.verify();
      return {
        provider: 'smtp',
        ok: true,
        detail: 'Connexion et authentification SMTP réussies.',
      };
    } catch (e) {
      return { provider: 'smtp', ok: false, detail: DETAIL[classify(e)] };
    }
  }
}
