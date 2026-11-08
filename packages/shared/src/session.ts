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
  /** Valeur indicative d'un crédit en FCFA (paramétrable dans l'admin). */
  creditValueFcfa: number;
}

export const SESSION_COOKIE = 'yamboka_session';

/** Appareil connecté au compte (liste des sessions actives). */
export interface SessionInfo {
  id: string;
  /** Vrai pour la session qui fait la demande. */
  current: boolean;
  /** « Chrome sur Windows » : déduit de l'agent utilisateur, sans autre donnée personnelle. */
  device: string;
  createdAt: string;
}
