"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

interface CardSpec {
  from: string;
  to: string;
  accent: string;
  position: [number, number, number];
  rotation: [number, number, number];
  video: boolean;
}

const CARDS: CardSpec[] = [
  { from: "#1f7a5f", to: "#3b8f9c", accent: "#f2b632", position: [-2.55, 1.05, -0.4], rotation: [0, 0.3, -0.07], video: true },
  { from: "#f2b632", to: "#c8613f", accent: "#1f7a5f", position: [-2.25, -1.45, 0], rotation: [0, 0.25, 0.06], video: false },
  { from: "#0f4a3a", to: "#1f7a5f", accent: "#f2b632", position: [2.5, 1.35, -0.2], rotation: [0, -0.3, -0.05], video: true },
  { from: "#c8613f", to: "#f2b632", accent: "#0f4a3a", position: [2.3, -1.2, 0.1], rotation: [0, -0.25, 0.07], video: false },
];

const W = 1.5;
const H = 1.95;

/** Dessine une carte « média » arrondie : dégradé, silhouette stylisée et, pour une vidéo, un bouton lecture. */
function makeCardTexture(spec: CardSpec): THREE.CanvasTexture {
  const w = 384;
  const h = Math.round((w * H) / W);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const r = 36;

  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, r);
  ctx.clip();

  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, spec.from);
  g.addColorStop(1, spec.to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = spec.accent;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(w * 0.72, h * 0.22, w * 0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.moveTo(0, h * 0.8);
  ctx.bezierCurveTo(w * 0.25, h * 0.66, w * 0.45, h * 0.92, w * 0.7, h * 0.78);
  ctx.bezierCurveTo(w * 0.85, h * 0.7, w, h * 0.74, w, h * 0.74);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.fillStyle = "#fbf8f3";
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.46, w * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.34, h * 0.8);
  ctx.bezierCurveTo(w * 0.34, h * 0.56, w * 0.66, h * 0.56, w * 0.66, h * 0.8);
  ctx.fill();

  if (spec.video) {
    ctx.fillStyle = "rgba(251,248,243,0.92)";
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.2, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0f4a3a";
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - 10, h * 0.2 - 15);
    ctx.lineTo(w * 0.5 + 18, h * 0.2);
    ctx.lineTo(w * 0.5 - 10, h * 0.2 + 15);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function Cards({ animate }: { animate: boolean }) {
  const group = useRef<THREE.Group>(null);
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const textures = useMemo(() => CARDS.map(makeCardTexture), []);

  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);

  useFrame((state) => {
    if (!animate || !group.current) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, state.pointer.x * 0.25, 0.05);
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, -state.pointer.y * 0.12, 0.05);
    meshes.current.forEach((m, i) => {
      if (m) m.position.y = CARDS[i].position[1] + Math.sin(t * 0.8 + i * 1.4) * 0.09;
    });
  });

  return (
    <group ref={group}>
      {CARDS.map((c, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          position={c.position}
          rotation={c.rotation}
        >
          <planeGeometry args={[W, H]} />
          <meshBasicMaterial map={textures[i]} transparent toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** `animate` = faux : un seul rendu statique (mouvement réduit, onglet masqué ou hors écran). */
export default function HeroScene({ animate }: { animate: boolean }) {
  return (
    <Canvas
      frameloop={animate ? "always" : "demand"}
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 11.5], fov: 38 }}
      gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
      aria-hidden
    >
      <Cards animate={animate} />
    </Canvas>
  );
}
