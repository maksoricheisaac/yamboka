import type { MetadataRoute } from "next";

/** Espace privé : rien ne doit être indexé (les pages portent aussi `robots: noindex`). Le site public a son propre robots.txt. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
