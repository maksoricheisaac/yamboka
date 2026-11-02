import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

export interface ApiFieldError {
  field: string;
  message: string;
}

/** Les messages bruts du validateur (anglais) sont remplacés par une phrase compréhensible ; ceux déjà rédigés par l'API sont conservés. */
function frenchFieldError(d: ApiFieldError): ApiFieldError {
  if (/^Invalid input: expected \w+, received undefined$/.test(d.message)) return { ...d, message: "Ce champ est obligatoire." };
  if (/^Invalid input: expected number/.test(d.message)) return { ...d, message: "Saisissez un nombre valide." };
  if (/^Invalid input/.test(d.message)) return { ...d, message: "Valeur invalide." };
  return d;
}

/** Erreur renvoyée par l'API (format unifié : code, message en français, détails par champ). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiFieldError[] = [],
    /** Informations complémentaires (ex. secondes avant de pouvoir redemander un code, essais restants). */
    readonly info: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

type Method = "POST" | "PATCH" | "DELETE";

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => null)) as
    | { code?: string; message?: string; details?: ApiFieldError[] | Record<string, unknown> }
    | null;
  if (!res.ok) {
    const details = data?.details;
    throw new ApiError(
      res.status,
      data?.code ?? "ERROR",
      data?.message ?? "Une erreur est survenue. Veuillez réessayer.",
      Array.isArray(details) ? details.map(frenchFieldError) : [],
      details && !Array.isArray(details) ? details : {},
    );
  }
  return data as T;
}

async function send<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Connexion impossible. Vérifiez votre réseau puis réessayez.");
  }
  const data = (await res.json().catch(() => null)) as
    | { code?: string; message?: string; details?: ApiFieldError[] | Record<string, unknown> }
    | null;
  if (!res.ok) {
    const details = data?.details;
    throw new ApiError(
      res.status,
      data?.code ?? "ERROR",
      data?.message ?? "Une erreur est survenue. Veuillez réessayer.",
      Array.isArray(details) ? details.map(frenchFieldError) : [],
      details && !Array.isArray(details) ? details : {},
    );
  }
  return data as T;
}

/** Appel depuis le navigateur : relayé par Next vers l'API, cookie de session de même origine. */
export const apiPost = <T = unknown>(path: string, body?: unknown) => send<T>("POST", path, body);
/** Envoi de fichier (multipart) : le navigateur fixe lui-même l'en-tête et sa limite. */
export async function apiUpload<T = unknown>(path: string, form: FormData): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method: "POST", credentials: "same-origin", body: form });
  } catch {
    throw new ApiError(0, "NETWORK", "Connexion impossible. Vérifiez votre réseau puis réessayez.");
  }
  return parse<T>(res);
}

/** Suppression : l'API répond 204 sans corps. */
export async function apiDelete(path: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method: "DELETE", credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "NETWORK", "Connexion impossible. Vérifiez votre réseau puis réessayez.");
  }
  if (!res.ok) await parse(res);
}

export const apiPatch = <T = unknown>(path: string, body?: unknown) => send<T>("PATCH", path, body);

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
