export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type EmailFailureReason =
  'not_configured' | 'auth' | 'connection' | 'timeout' | 'rejected' | 'unknown';

/** Échec d'envoi : le message d'origine du transport est volontairement absent (il peut citer l'hôte ou l'utilisateur SMTP). */
export class EmailDeliveryError extends Error {
  constructor(readonly reason: EmailFailureReason) {
    super(`Envoi d'e-mail impossible (${reason})`);
  }
}

export interface EmailDiagnostic {
  provider: 'console' | 'smtp';
  ok: boolean;
  /** Diagnostic lisible, sans secret ni nom d'hôte. */
  detail: string;
}

/** Abstraction d'envoi : console en local (rien n'est envoyé), SMTP en production (cahier des charges §2.2). */
export abstract class EmailProvider {
  abstract readonly name: 'console' | 'smtp';
  /** Lève EmailDeliveryError si le message n'a pas pu être remis au serveur d'envoi. */
  abstract send(message: EmailMessage): Promise<void>;
  /** Vérifie la connexion et l'authentification sans envoyer de message. */
  abstract diagnose(): Promise<EmailDiagnostic>;
}
