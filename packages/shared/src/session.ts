/** Représentation d'un utilisateur connecté, renvoyée par GET /auth/me. */
export type Role = 'USER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED';

export interface SessionUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
  /** Faux tant que les textes légaux en vigueur ne sont pas acceptés (ex. première connexion Google). */
  legalAccepted: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
  /** Solde de crédits (somme du registre). */
  credits: number;
}

export const SESSION_COOKIE = 'yamboka_session';
