export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Abstraction d'envoi : console en local, SMTP ou Resend à brancher plus tard (cahier des charges §2.2). */
export abstract class EmailProvider {
  abstract send(message: EmailMessage): Promise<void>;
}
