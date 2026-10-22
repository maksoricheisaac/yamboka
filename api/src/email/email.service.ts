import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { EmailProvider } from './email.provider';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Modèles d'e-mails destinés aux utilisateurs, rédigés en français. */
@Injectable()
export class EmailService {
  constructor(
    private readonly provider: EmailProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private url(path: string, token: string): string {
    return `${this.config.get('APP_URL', { infer: true })}${path}?token=${encodeURIComponent(token)}`;
  }

  private layout(
    title: string,
    intro: string,
    ctaLabel: string,
    ctaUrl: string,
    outro: string,
  ): { text: string; html: string } {
    const text = `${title}\n\n${intro}\n\n${ctaLabel} : ${ctaUrl}\n\n${outro}\n\n— L'équipe Yamboka`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1b2a24">
<h1 style="font-size:20px">${esc(title)}</h1><p>${esc(intro)}</p>
<p><a href="${esc(ctaUrl)}" style="display:inline-block;background:#0f5a46;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">${esc(ctaLabel)}</a></p>
<p style="font-size:13px;color:#555">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>${esc(ctaUrl)}</p>
<p style="font-size:13px;color:#555">${esc(outro)}</p><p>— L'équipe Yamboka</p></div>`;
    return { text, html };
  }

  async sendVerification(
    to: string,
    firstName: string,
    token: string,
  ): Promise<void> {
    const body = this.layout(
      `Bienvenue sur Yamboka, ${firstName}`,
      'Confirmez votre adresse e-mail pour pouvoir acheter des crédits et créer vos vidéos. Ce lien est valable 24 heures.',
      'Confirmer mon adresse e-mail',
      this.url('/verifier-email', token),
      "Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement cet e-mail.",
    );
    await this.provider.send({
      to,
      subject: 'Confirmez votre adresse e-mail — Yamboka',
      ...body,
    });
  }

  async sendPasswordReset(
    to: string,
    firstName: string,
    token: string,
  ): Promise<void> {
    const body = this.layout(
      'Réinitialisation de votre mot de passe',
      `Bonjour ${firstName}, vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable 1 heure et ne peut servir qu'une fois.`,
      'Choisir un nouveau mot de passe',
      this.url('/nouveau-mot-de-passe', token),
      "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.",
    );
    await this.provider.send({
      to,
      subject: 'Réinitialisation de votre mot de passe — Yamboka',
      ...body,
    });
  }
}
