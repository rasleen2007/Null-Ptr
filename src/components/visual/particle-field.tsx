"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
}

export function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let frame = 0;
    let particles: Particle[] = [];
    const pointer = { x: -9999, y: -9999 };

    const buildParticles = () => {
      const count = Math.min(110, Math.max(30, Math.floor((width * height) / 26000)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        radius: Math.random() * 1.4 + 0.4,
        alpha: Math.random() * 0.5 + 0.15,
      }));
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildParticles();
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i += 1) {
        const particle = particles[i];
        if (!reducedMotion) {
          particle.x += particle.vx;
          particle.y += particle.vy;
          if (particle.x < -20) particle.x = width + 20;
          if (particle.x > width + 20) particle.x = -20;
          if (particle.y < -20) particle.y = height + 20;
          if (particle.y > height + 20) particle.y = -20;
        }

        const pointerDistance = Math.hypot(particle.x - pointer.x, particle.y - pointer.y);
        const highlighted = pointerDistance < 180;
        context.beginPath();
        context.arc(particle.x, particle.y, highlighted ? particle.radius * 1.7 : particle.radius, 0, Math.PI * 2);
        context.fillStyle = highlighted
          ? `rgba(103, 232, 249, ${Math.min(0.85, particle.alpha + 0.35)})`
          : `rgba(148, 197, 255, ${particle.alpha})`;
        context.fill();

        for (let j = i + 1; j < particles.length; j += 1) {
          const other = particles[j];
          const distance = Math.hypot(particle.x - other.x, particle.y - other.y);
          if (distance < 118) {
            const alpha = (1 - distance / 118) * 0.1;
            context.beginPath();
            context.moveTo(particle.x, particle.y);
            context.lineTo(other.x, other.y);
            context.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
            context.lineWidth = 0.6;
            context.stroke();
          }
        }
      }

      if (!reducedMotion) frame = requestAnimationFrame(draw);
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    const onPointerLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 grid-overlay opacity-60" />
      <div className="absolute -left-40 top-1/4 h-[32rem] w-[32rem] rounded-full bg-cyan-500/[0.05] blur-[120px]" />
      <div className="absolute -right-40 bottom-0 h-[36rem] w-[36rem] rounded-full bg-blue-600/[0.06] blur-[140px]" />
      <canvas ref={canvasRef} className="absolute inset-0 opacity-70" />
    </div>
  );
}
