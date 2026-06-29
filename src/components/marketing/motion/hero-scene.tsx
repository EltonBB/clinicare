"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Float, Lightformer, Sparkles } from "@react-three/drei";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  BufferAttribute,
  type BufferGeometry,
  Color,
  ExtrudeGeometry,
  type Mesh,
  Vector3,
} from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

/**
 * The hero's living centerpiece: the Vela brand mark, extruded into a 3D solid
 * with the cobalt→light-blue brand gradient baked into its faces. It drifts
 * gently on its own, and rotates *away* from the cursor as it approaches —
 * a soft repulsion. Pure WebGL, no generated media. Rendered client-only via a
 * dynamic import with a static fallback (see cinematic-hero.tsx).
 */

// The Vela mark, inlined from public/brand/vela-icon.svg (just the path the
// loader needs — fill/gradient are reconstructed below as vertex colors).
const VELA_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 612 612"><path d="M257.43,309.34c-2.53,15.34,6.46,25.34,19.6,31.79,5.84,2.87,11.73,4.88,17.97,6.82,19.28,6,37.58,14.14,48.88,31.63,7.55,11.69,11.4,25.34,11.14,39.27-.15,8.22-2.85,15.72-8.17,21.85-5.69,6.55-13.68,11.06-22.55,11.06h-34.09c-15.3,0-29.42-14.88-29.46-30.19l-.18-60.93c-.02-6.41-5.27-10.54-11.41-10.56l-54.17-.12c-17.01-.04-30.32-15.08-30.36-31.7l-.08-31.43c-.5-17.38,12.62-32.92,30.47-33.43l55.66-.29c5.33-.03,9.83-4.62,9.85-9.77l.24-53.69c.07-15.67,13.43-28.85,28.99-29.34l32.27-.05c15.43-.02,28.73,12.71,29.39,28.41l.3,54.05c.03,5.19,3.86,10.32,9.47,10.35l55.7.31c15.74.09,29.48,13.38,30.36,29.16l.22,34.95c.11,16.69-12.86,31.72-29.84,32.43l-40.66.13c-16.96.05-31.18-15.39-31.18-33.05v-99.53s0-.72,0-.72c0-.14-.37.37-.43.5-5.64,12.56-17.53,23.39-28.91,31.14-6.3,4.29-12.63,7.71-19.36,11.26-8.87,4.68-16.97,10.26-23.7,17.68-8.26,9.11-13.94,19.94-15.94,32.03Z"/></svg>`;

// Shared pointer state in viewport (client) pixels, written by a window-level
// listener so the repel tracks the cursor even where the hero text overlays the
// canvas. `active` flips false when the pointer leaves the window.
type PointerState = { x: number; y: number; active: boolean };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (v: number) => v * v * (3 - 2 * v);

/** Bake the brand gradient (cobalt → light blue, along the mark's diagonal). */
function applyBrandGradient(geo: BufferGeometry) {
  const pos = geo.attributes.position;
  const count = pos.count;
  // Diagonal axis (up-right), echoing the SVG's linear gradient direction.
  const ax = 0.5;
  const ay = 0.866;
  const proj = new Float32Array(count);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < count; i++) {
    const p = pos.getX(i) * ax + pos.getY(i) * ay;
    proj[i] = p;
    if (p < min) min = p;
    if (p > max) max = p;
  }
  const span = max - min || 1;
  const cobalt = new Color("#0A22FF");
  const sky = new Color("#64B6FF");
  const c = new Color();
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    c.copy(cobalt).lerp(sky, (proj[i] - min) / span);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new BufferAttribute(colors, 3));
}

function useVelaMarkGeometry() {
  return useMemo(() => {
    const { paths } = new SVGLoader().parse(VELA_MARK_SVG);
    const shapes = paths.flatMap((path) => SVGLoader.createShapes(path));
    const geo = new ExtrudeGeometry(shapes, {
      depth: 48,
      bevelEnabled: true,
      bevelThickness: 10,
      bevelSize: 7,
      bevelSegments: 5,
      curveSegments: 28,
    });
    // SVG space is y-down; rotate (don't mirror) so the mark stands upright and
    // reads un-flipped — a scale(1,-1,1) reflection would invert the winding and
    // render the faces inside-out.
    geo.rotateX(Math.PI);
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const center = new Vector3();
    const size = new Vector3();
    bb.getCenter(center);
    bb.getSize(size);
    geo.translate(-center.x, -center.y, -center.z);
    // Match the orb's footprint (~3.4 world units across). Guard the divisor so a
    // degenerate (empty-shape) bbox can't scale the geometry to Infinity / NaN.
    const maxDim = Math.max(size.x, size.y);
    const scale = maxDim > 0 ? 3.4 / maxDim : 1;
    geo.scale(scale, scale, scale);
    geo.computeVertexNormals();
    applyBrandGradient(geo);
    return geo;
  }, []);
}

function VelaMark({
  pointer,
  rect,
}: {
  pointer: RefObject<PointerState>;
  rect: RefObject<DOMRect | null>;
}) {
  const mesh = useRef<Mesh>(null);
  const geometry = useVelaMarkGeometry();
  const ndc = useMemo(() => new Vector3(), []);

  // useMemo'd geometry passed via prop isn't auto-disposed by R3F (only
  // JSX-declared geometry is); release it when the hero unmounts.
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const t = state.clock.elapsedTime;

    // The mark's center, projected to normalized device coords (-1..1).
    m.getWorldPosition(ndc);
    ndc.project(state.camera);

    let influence = 0;
    let dirX = 0;
    let dirY = 0;
    const p = pointer.current;
    const r = rect.current;
    if (p.active && r && r.width > 0) {
      const px = ((p.x - r.left) / r.width) * 2 - 1;
      const py = -(((p.y - r.top) / r.height) * 2 - 1);
      const dx = px - ndc.x;
      const dy = py - ndc.y;
      const dist = Math.hypot(dx, dy) || 1e-4;
      influence = smoothstep(clamp01(1 - dist / 1.15));
      dirX = dx / dist;
      dirY = dy / dist;
    }

    // Idle drift (always on) + repel away from the cursor (scaled by proximity).
    const idleY = Math.sin(t * 0.45) * 0.2;
    const idleX = Math.sin(t * 0.6) * 0.1;
    const repel = 0.7;
    const targetY = idleY - dirX * influence * repel;
    const targetX = idleX + dirY * influence * repel;
    m.rotation.y += (targetY - m.rotation.y) * 0.085;
    m.rotation.x += (targetX - m.rotation.x) * 0.085;
  });

  return (
    <group position={[1.1, 0.15, 0]}>
      <Float speed={1.1} rotationIntensity={0} floatIntensity={0.9}>
        <mesh ref={mesh} geometry={geometry}>
          <meshStandardMaterial
            vertexColors
            roughness={0.26}
            metalness={0.55}
            emissive="#0a22ff"
            emissiveIntensity={0.16}
            envMapIntensity={0.9}
          />
        </mesh>
      </Float>
    </group>
  );
}

function ParallaxRig({
  pointer,
  rect,
}: {
  pointer: RefObject<PointerState>;
  rect: RefObject<DOMRect | null>;
}) {
  useFrame((state) => {
    let nx = 0;
    let ny = 0;
    const p = pointer.current;
    const r = rect.current;
    if (p.active && r && r.width > 0) {
      nx = ((p.x - r.left) / r.width) * 2 - 1;
      ny = -(((p.y - r.top) / r.height) * 2 - 1);
    }
    const targetX = nx * 0.55;
    const targetY = ny * 0.35;
    state.camera.position.x += (targetX - state.camera.position.x) * 0.035;
    state.camera.position.y += (targetY - state.camera.position.y) * 0.035;
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function HeroScene({ active = true }: { active?: boolean }) {
  const pointer = useRef<PointerState>({ x: 0, y: 0, active: false });
  // The canvas viewport rect, cached and refreshed only on scroll/resize so the
  // per-frame pointer math never calls getBoundingClientRect (a forced layout
  // flush — twice per frame across both rigs before this).
  const rect = useRef<DOMRect | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Track the cursor at the window level — the canvas sits behind the hero
    // text (-z-20), so canvas-only pointer events would miss most of the hero.
    const onMove = (event: PointerEvent) => {
      pointer.current.x = event.clientX;
      pointer.current.y = event.clientY;
      pointer.current.active = true;
    };
    const onLeave = () => {
      pointer.current.active = false;
    };
    const refreshRect = () => {
      if (canvas.current) {
        rect.current = canvas.current.getBoundingClientRect();
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", refreshRect, { passive: true });
    window.addEventListener("resize", refreshRect);
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);

    // R3F's resize observer can miss the initial size when mounted from a lazy
    // chunk; nudge a resize on mount so the canvas fills its container reliably.
    const kick = () => {
      window.dispatchEvent(new Event("resize"));
      refreshRect();
    };
    const raf = requestAnimationFrame(kick);
    const timer = setTimeout(kick, 200);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", refreshRect);
      window.removeEventListener("resize", refreshRect);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, []);

  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 0, 6], fov: 42 }}
      dpr={[1, 1.8]}
      gl={{ antialias: true, alpha: true }}
      style={{ position: "absolute", inset: 0 }}
      onCreated={(state) => {
        canvas.current = state.gl.domElement;
        rect.current = state.gl.domElement.getBoundingClientRect();
      }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} color="#64B6FF" />
      <pointLight position={[-4, -2, 3]} intensity={2.8} color="#0A22FF" />
      <VelaMark pointer={pointer} rect={rect} />
      <Sparkles count={80} scale={[11, 7, 5]} size={2.4} speed={0.25} color="#a8c7ff" opacity={0.55} />
      <Environment resolution={256}>
        <Lightformer intensity={2.2} position={[0, 2, 4]} scale={[6, 6, 1]} color="#64B6FF" />
        <Lightformer intensity={2} position={[-3, -2, 2]} scale={[4, 4, 1]} color="#0A22FF" />
        <Lightformer intensity={1.2} position={[3, 0, -3]} scale={[5, 5, 1]} color="#bcd4ff" />
      </Environment>
      <ParallaxRig pointer={pointer} rect={rect} />
    </Canvas>
  );
}
