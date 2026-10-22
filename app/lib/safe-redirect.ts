/** N'autorise que des chemins internes de l'espace privé : évite les redirections ouvertes après connexion. */
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/app";
  if (value === "/app" || value.startsWith("/app/") || value.startsWith("/app?")) return value;
  if (value === "/admin" || value.startsWith("/admin/") || value.startsWith("/admin?")) return value;
  return "/app";
}
