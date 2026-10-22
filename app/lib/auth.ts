import "server-only";
import { redirect } from "next/navigation";
import type { Role, SessionUser } from "@yamboka/shared";
import { getSessionUser } from "./server-api";

interface RequireOptions {
  role?: Role;
  /** Autorise un utilisateur qui n'a pas encore accepté les textes légaux (page d'acceptation). */
  allowUnacceptedLegal?: boolean;
}

/**
 * Point d'entrée unique du contrôle d'accès côté serveur Next (Data Access Layer).
 * Le proxy ne vérifie que la présence du cookie ; la vraie vérification est ici ET dans l'API.
 */
export async function requireUser(options: RequireOptions = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  if (options.role && user.role !== options.role) redirect("/app");
  if (!options.allowUnacceptedLegal && !user.legalAccepted) redirect("/accepter-conditions");
  return user;
}
