"use client";

import { useEffect, useRef } from "react";

// The Vela mark (public/brand/vela-icon.svg), drawn on a 612 unit canvas.
const MARK =
  "M257.43,309.34c-2.53,15.34,6.46,25.34,19.6,31.79,5.84,2.87,11.73,4.88,17.97,6.82,19.28,6,37.58,14.14,48.88,31.63,7.55,11.69,11.4,25.34,11.14,39.27-.15,8.22-2.85,15.72-8.17,21.85-5.69,6.55-13.68,11.06-22.55,11.06h-34.09c-15.3,0-29.42-14.88-29.46-30.19l-.18-60.93c-.02-6.41-5.27-10.54-11.41-10.56l-54.17-.12c-17.01-.04-30.32-15.08-30.36-31.7l-.08-31.43c-.5-17.38,12.62-32.92,30.47-33.43l55.66-.29c5.33-.03,9.83-4.62,9.85-9.77l.24-53.69c.07-15.67,13.43-28.85,28.99-29.34l32.27-.05c15.43-.02,28.73,12.71,29.39,28.41l.3,54.05c.03,5.19,3.86,10.32,9.47,10.35l55.7.31c15.74.09,29.48,13.38,30.36,29.16l.22,34.95c.11,16.69-12.86,31.72-29.84,32.43l-40.66.13c-16.96.05-31.18-15.39-31.18-33.05v-99.53s0-.72,0-.72c0-.14-.37.37-.43.5-5.64,12.56-17.53,23.39-28.91,31.14-6.3,4.29-12.63,7.71-19.36,11.26-8.87,4.68-16.97,10.26-23.7,17.68-8.26,9.11-13.94,19.94-15.94,32.03Z";
const MARK_CX = 308;
const MARK_CY = 307;
const MARK_W = 250;

type Fish = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  /** 0 far (small, faint, slow) to 1 near. */
  depth: number;
  phase: number;
  glow: number;
  spin: number;
  turn: number;
};

const REACH = 150; // how close the pointer has to come before they notice
const NEIGHBOUR = 90;

/**
 * Small Vela marks swimming behind the home hero like a loose school: they
 * drift, keep a little distance, roughly align with their neighbours, and
 * dart away (brightening as they pass) when the pointer comes close. A click
 * sends a ripple through them. Off screen or in a hidden tab the loop stops;
 * reduced motion draws one still frame.
 */
export function VelaSchool({ still }: { still: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !host || !ctx) return;

    const mark = new Path2D(MARK);
    const fill = ctx.createLinearGradient(249.28, 234.46, 431.79, 450.65);
    fill.addColorStop(0, "#0A22FF");
    fill.addColorStop(1, "#64B6FF");

    let w = 0;
    let h = 0;
    let dpr = 1;
    let fish: Fish[] = [];
    let seed = 11;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    const spawn = () => {
      const count = w < 640 ? 12 : w < 1100 ? 20 : 26;
      seed = 11;
      fish = Array.from({ length: count }, () => {
        const depth = rand();
        const angle = rand() * Math.PI * 2;
        const speed = 0.25 + depth * 0.35;
        return {
          x: rand() * w,
          y: rand() * h,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 12 + depth * 22,
          depth,
          phase: rand() * Math.PI * 2,
          glow: 0,
          spin: 0,
          turn: (rand() - 0.5) * 0.004,
        };
      });
    };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const prevW = w;
      const prevH = h;
      w = rect.width;
      h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      if (!fish.length || !prevW || !prevH) spawn();
      else
        for (const f of fish) {
          f.x = (f.x / prevW) * w;
          f.y = (f.y / prevH) * h;
        }
    };

    const pointer = { x: 0, y: 0, inside: false };
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.inside = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= rect.width && pointer.y <= rect.height;
    };
    const onLeave = () => {
      pointer.inside = false;
    };
    const onDown = (e: PointerEvent) => {
      onMove(e);
      if (!pointer.inside) return;
      for (const f of fish) {
        const dx = f.x - pointer.x;
        const dy = f.y - pointer.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > 320) continue;
        const kick = (1 - d / 320) * 4.5;
        f.vx += (dx / d) * kick;
        f.vy += (dy / d) * kick;
        f.glow = Math.max(f.glow, 1 - d / 320);
        f.spin += (Math.random() - 0.5) * 0.3;
      }
    };

    const draw = (t: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const f of fish) {
        const heading = Math.atan2(f.vy, f.vx);
        // A slow tail beat, so the marks read as swimming rather than sliding.
        const angle = heading + Math.sin(t * 0.004 + f.phase) * 0.18 + f.spin;
        const scale = (f.size * (1 + f.glow * 0.35)) / MARK_W;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.translate(f.x, f.y);
        ctx.rotate(angle);
        ctx.scale(scale, scale);
        ctx.translate(-MARK_CX, -MARK_CY);
        ctx.globalAlpha = 0.07 + f.depth * 0.13 + f.glow * 0.55;
        ctx.fillStyle = fill;
        ctx.fill(mark);
      }
      ctx.globalAlpha = 1;
    };

    const step = () => {
      for (const f of fish) {
        let ax = 0;
        let ay = 0;
        let alignX = 0;
        let alignY = 0;
        let centreX = 0;
        let centreY = 0;
        let near = 0;

        for (const o of fish) {
          if (o === f) continue;
          const dx = o.x - f.x;
          const dy = o.y - f.y;
          const d = Math.hypot(dx, dy);
          if (d > NEIGHBOUR || d === 0) continue;
          near++;
          alignX += o.vx;
          alignY += o.vy;
          centreX += o.x;
          centreY += o.y;
          // Keep a little personal space.
          const push = (1 - d / NEIGHBOUR) * 0.03;
          ax -= (dx / d) * push;
          ay -= (dy / d) * push;
        }
        if (near) {
          ax += (alignX / near - f.vx) * 0.012;
          ay += (alignY / near - f.vy) * 0.012;
          ax += (centreX / near - f.x) * 0.0004;
          ay += (centreY / near - f.y) * 0.0004;
        }

        // Wander: each mark curves gently on its own.
        const c = Math.cos(f.turn);
        const s = Math.sin(f.turn);
        const vx = f.vx * c - f.vy * s;
        f.vy = f.vx * s + f.vy * c;
        f.vx = vx;

        // The pointer: dart away, light up while close.
        let target = 0;
        if (pointer.inside) {
          const dx = f.x - pointer.x;
          const dy = f.y - pointer.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < REACH) {
            const k = 1 - d / REACH;
            ax += (dx / d) * k * k * 0.9;
            ay += (dy / d) * k * k * 0.9;
            target = k;
          }
        }
        f.glow += (target - f.glow) * (target > f.glow ? 0.25 : 0.04);
        f.spin *= 0.94;

        f.vx += ax;
        f.vy += ay;

        // Ease back to a calm cruising speed after any burst.
        const speed = Math.hypot(f.vx, f.vy) || 1;
        const cruise = 0.25 + f.depth * 0.35;
        const next = speed + (cruise - speed) * 0.035;
        f.vx = (f.vx / speed) * next;
        f.vy = (f.vy / speed) * next;

        f.x += f.vx;
        f.y += f.vy;

        const m = f.size * 1.5;
        if (f.x < -m) f.x = w + m;
        else if (f.x > w + m) f.x = -m;
        if (f.y < -m) f.y = h + m;
        else if (f.y > h + m) f.y = -m;
      }
    };

    resize();

    if (still) {
      draw(0);
      const ro = new ResizeObserver(() => {
        resize();
        draw(0);
      });
      ro.observe(host);
      return () => ro.disconnect();
    }

    let frame = 0;
    let visible = true;
    const loop = (t: number) => {
      step();
      draw(t);
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!frame && visible && !document.hidden) frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(host);
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    const onVisibility = () => (document.hidden ? stop() : start());

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [still]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 size-full" />;
}
