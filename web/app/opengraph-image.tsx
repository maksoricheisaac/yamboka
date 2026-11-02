import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getMedia } from "@/lib/media";

export const alt = "Yamboka — Vidéos et images par IA, payées en mobile money";
export const size = { width: 1200, height: 630 };
// Si `public/images/partage.jpg` existe (visuel 1200 × 630 avec une vraie création), il est servi tel quel ;
// sinon l’image est générée ci-dessous. Le type annoncé suit le choix.
const PARTAGE_PATH = path.join(process.cwd(), "public", "images", "partage.jpg");
export const contentType = getMedia().partage ? "image/jpeg" : "image/png";

export default function OpengraphImage() {
  if (getMedia().partage) {
    return new Response(readFileSync(PARTAGE_PATH), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600" } });
  }
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #0f4a3a 0%, #1f7a5f 100%)",
          color: "#fbf8f3",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 44, fontWeight: 700 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#fbf8f3", display: "flex" }} />
          Yamboka
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, maxWidth: 980 }}>
            Vos vidéos et images par IA, payées en mobile money.
          </div>
          <div style={{ fontSize: 34, color: "#f2b632" }}>À partir de 5 000 FCFA · Né à Brazzaville</div>
        </div>
      </div>
    ),
    size,
  );
}
