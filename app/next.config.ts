import path from "node:path";
import type { NextConfig } from "next";

// Configuration centralisée à la racine du dépôt (développement hors Docker). Absent en conteneur : les variables
// y sont fournies par Docker Compose. Les variables déjà définies (shell, CI, Compose) l'emportent sur le fichier.
const REPO_ROOT = path.resolve(process.cwd(), "..");
try {
  process.loadEnvFile(path.join(REPO_ROOT, ".env.local"));
} catch {
  // Pas de .env.local à la racine : rien à charger.
}

/** Adresse interne de l'API (serveur uniquement, jamais exposée au navigateur). */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Image Docker : sortie autonome (serveur minimal). La racine du dépôt est nécessaire pour tracer @yamboka/shared.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const, outputFileTracingRoot: REPO_ROOT } : {}),
  // Les tests de navigateur compilent dans un dossier à part (NEXT_DIST_DIR) pour ne pas gêner un serveur de développement.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Yamboka ne produit plus d'images : les anciens liens « Créer une affiche » mènent au studio vidéo. Next émet un
  // 308 (permanent, même méthode) là où l'on parle de 301 : pour une navigation GET, les moteurs les traitent pareil.
  async redirects() {
    return [
      {
        source: "/app/creer",
        has: [{ type: "query" as const, key: "type", value: "affiche" }],
        destination: "/app/creer",
        permanent: true,
      },
    ];
  },
  // Le navigateur parle uniquement à cette origine : /api/* est relayé vers l'API.
  // Le cookie de session reste ainsi « même origine » (pas de CORS, CSRF simplifié).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_INTERNAL_URL}/api/:path*` }];
  },
};

export default nextConfig;
