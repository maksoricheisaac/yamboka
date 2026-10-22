import type { MetadataRoute } from "next";
import { SITE } from "@/content/site";

const ROUTES = [
  "",
  "/fonctionnalites",
  "/comment-ca-marche",
  "/tarifs",
  "/galerie",
  "/cas-utilisation",
  "/a-propos",
  "/faq",
  "/contact",
  "/confidentialite",
  "/conditions-utilisation",
  "/charte-utilisation",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((path) => ({
    url: `${SITE.url}${path}`,
    changeFrequency: path === "" || path === "/tarifs" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/tarifs" ? 0.9 : 0.6,
  }));
}
