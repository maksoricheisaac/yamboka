import { ImageResponse } from "next/og";

export const alt = "Yamboka — Vidéos et images par IA, payées en mobile money";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
          <div style={{ fontSize: 34, color: "#f2b632" }}>À partir de 500 FCFA · Né à Brazzaville</div>
        </div>
      </div>
    ),
    size,
  );
}
