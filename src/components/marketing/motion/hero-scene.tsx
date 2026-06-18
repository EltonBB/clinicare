"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Float, Lightformer, MeshDistortMaterial, Sparkles } from "@react-three/drei";
import { useEffect, useRef } from "react";
import type { Mesh } from "three";

/**
 * The hero's living centerpiece: a slowly morphing, gradient-lit glass orb
 * with a floating particle field and mouse-parallax camera. Pure WebGL — no
 * generated media required. Rendered client-only via a dynamic import with a
 * static fallback (see cinematic-hero.tsx).
 */
function Orb() {
  const mesh = useRef<Mesh>(null);

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    m.rotation.y = state.clock.elapsedTime * 0.12;
    m.rotation.z = state.clock.elapsedTime * 0.04;
  });

  return (
    <group position={[1.1, 0.15, 0]}>
      <Float speed={1.1} rotationIntensity={0.4} floatIntensity={1.1}>
        <mesh ref={mesh} scale={1.85}>
          <sphereGeometry args={[1, 64, 64]} />
          <MeshDistortMaterial
            color="#1f4bff"
            emissive="#0a22ff"
            emissiveIntensity={0.34}
            roughness={0.2}
            metalness={0.62}
            distort={0.4}
            speed={1.5}
          />
        </mesh>
      </Float>
    </group>
  );
}

function ParallaxRig() {
  useFrame((state) => {
    const targetX = state.pointer.x * 0.6;
    const targetY = state.pointer.y * 0.4;
    state.camera.position.x += (targetX - state.camera.position.x) * 0.035;
    state.camera.position.y += (targetY - state.camera.position.y) * 0.035;
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function HeroScene() {
  // R3F's resize observer can miss the initial size when mounted from a lazy
  // chunk; nudge a resize on mount so the canvas fills its container reliably.
  useEffect(() => {
    const kick = () => window.dispatchEvent(new Event("resize"));
    const raf = requestAnimationFrame(kick);
    const timer = setTimeout(kick, 200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, []);

  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 42 }}
      dpr={[1, 1.8]}
      gl={{ antialias: true, alpha: true }}
      style={{ position: "absolute", inset: 0 }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} color="#64B6FF" />
      <pointLight position={[-4, -2, 3]} intensity={2.8} color="#0A22FF" />
      <Orb />
      <Sparkles count={80} scale={[11, 7, 5]} size={2.4} speed={0.25} color="#a8c7ff" opacity={0.55} />
      <Environment resolution={256}>
        <Lightformer intensity={2.2} position={[0, 2, 4]} scale={[6, 6, 1]} color="#64B6FF" />
        <Lightformer intensity={2} position={[-3, -2, 2]} scale={[4, 4, 1]} color="#0A22FF" />
        <Lightformer intensity={1.2} position={[3, 0, -3]} scale={[5, 5, 1]} color="#bcd4ff" />
      </Environment>
      <ParallaxRig />
    </Canvas>
  );
}
