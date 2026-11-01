import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { SESSION_COOKIE, type SessionUser } from "@yamboka/shared";

const API = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/** Utilisateur de la session courante, ou null. Dédupliqué par rendu (cache React), jamais mis en cache entre requêtes. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const res = await fetch(`${API}/v1/auth/me`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
    cache: "no-store",
  });
  // 401 : session absente ou expirée ; 403 : compte suspendu ou banni.
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`API /auth/me : ${res.status}`);
  return ((await res.json()) as { user: SessionUser }).user;
});

export interface AuthProviders {
  google: boolean;
  emailOtp: { length: number; ttlMinutes: number; resendCooldownSeconds: number };
}

const DEFAULT_PROVIDERS: AuthProviders = { google: false, emailOtp: { length: 6, ttlMinutes: 10, resendCooldownSeconds: 60 } };

/** Méthodes de connexion proposées (le bouton Google n'apparaît que s'il est configuré) et paramètres des codes e-mail. */
export async function getAuthProviders(): Promise<AuthProviders> {
  try {
    const res = await fetch(`${API}/v1/auth/providers`, { cache: "no-store" });
    if (!res.ok) return DEFAULT_PROVIDERS;
    return (await res.json()) as AuthProviders;
  } catch {
    return DEFAULT_PROVIDERS;
  }
}

/** Lecture d'une route authentifiée de l'API depuis un composant serveur (cookie de session transmis). */
export async function serverGet<T>(path: string): Promise<T> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const res = await fetch(`${API}/v1${path}`, {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API ${path} : ${res.status}`);
  return (await res.json()) as T;
}

/** Lecture d'une route publique de l'API (packs, produits). */
export async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/v1${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path} : ${res.status}`);
  return (await res.json()) as T;
}

/** Comme serverGet, mais renvoie null si la ressource n'existe pas (404) : permet un notFound() propre. */
export async function serverGetOrNull<T>(path: string): Promise<T | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const res = await fetch(`${API}/v1${path}`, {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
    cache: "no-store",
  });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`API ${path} : ${res.status}`);
  return (await res.json()) as T;
}
