import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

export interface ApiFieldError {
  field: string;
  message: string;
}

/** Erreur renvoyée par l'API (format unifié : code, message en français, détails par champ). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiFieldError[] = [],
  ) {
    super(message);
  }
}

/** Appel depuis le navigateur : relayé par Next vers l'API, cookie de session de même origine. */
export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Connexion impossible. Vérifiez votre réseau puis réessayez.");
  }
  const data = (await res.json().catch(() => null)) as
    | { code?: string; message?: string; details?: ApiFieldError[] }
    | null;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.code ?? "ERROR",
      data?.message ?? "Une erreur est survenue. Veuillez réessayer.",
      Array.isArray(data?.details) ? data.details : [],
    );
  }
  return data as T;
}

/** Lecture depuis le navigateur (même origine, cookie de session inclus). */
export async function apiGet<T = unknown>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new ApiError(0, "NETWORK", "Connexion impossible. Vérifiez votre réseau puis réessayez.");
  }
  const data = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.code ?? "ERROR", data?.message ?? "Une erreur est survenue. Veuillez réessayer.");
  }
  return data as T;
}

/**
 * Affiche les erreurs de validation du serveur sous les champs concernés.
 * Retourne le message général à montrer si aucune erreur ne correspond à un champ.
 */
export function applyApiError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly string[],
): string | null {
  if (!(error instanceof ApiError)) return "Une erreur est survenue. Veuillez réessayer.";
  let matched = false;
  for (const d of error.details) {
    if (knownFields.includes(d.field)) {
      setError(d.field as Path<T>, { type: "server", message: d.message });
      matched = true;
    }
  }
  return matched ? null : error.message;
}
