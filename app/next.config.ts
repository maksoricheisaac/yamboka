import type { NextConfig } from "next";

/** Adresse interne de l'API (serveur uniquement, jamais exposée au navigateur). */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
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
  // Le navigateur parle uniquement à cette origine : /api/* est relayé vers l'API.
  // Le cookie de session reste ainsi « même origine » (pas de CORS, CSRF simplifié).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_INTERNAL_URL}/v1/:path*` }];
  },
};

export default nextConfig;
