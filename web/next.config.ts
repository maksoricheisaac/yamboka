import type { NextConfig } from "next";

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
};

export default nextConfig;
