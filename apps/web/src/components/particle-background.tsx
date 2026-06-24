'use client';

import { useEffect, useRef } from 'react';

interface Star {
  x: number; y: number; size: number; alpha: number; speed: number; phase: number;
}

interface Particle {
  x: number; y: number; size: number; alpha: number; speedX: number; speedY: number;
}

function drawGrass(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, count: number) {
  for (let i = 0; i < count; i++) {
    const gx = x + (Math.random() - 0.5) * 120;
    const gh = 8 + Math.random() * 20;
    const sway = Math.sin(Date.now() * 0.001 + i) * 2;
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.quadraticCurveTo(gx + sway, y - gh * 0.6, gx + sway * 1.5, y - gh);
    ctx.strokeStyle = 'rgba(255, 215, 120, 0.06)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

function drawThorfinn(ctx: CanvasRenderingContext2D, cx: number, groundY: number, scale: number, breath: number) {
  const s = scale;
  ctx.save();
  ctx.translate(cx, groundY);

  const breathOffset = Math.sin(breath) * 1.2 * s;

  // ---- silhouette fill ----
  ctx.fillStyle = 'rgba(30, 25, 50, 0.55)';
  ctx.strokeStyle = 'rgba(255, 215, 120, 0.08)';
  ctx.lineWidth = 1;

  // Head
  const headR = 14 * s;
  ctx.beginPath();
  ctx.arc(0, -72 * s + breathOffset * 0.2, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Spiky hair (Thorfinn)
  ctx.fillStyle = 'rgba(25, 20, 45, 0.7)';
  for (let a = -1.8; a < 0.2; a += 0.25) {
    const spikeH = (6 + Math.random() * 8) * s;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * headR, -72 * s + Math.sin(a) * headR + breathOffset * 0.2);
    ctx.lineTo(Math.cos(a - 0.15) * (headR + spikeH), -72 * s + Math.sin(a - 0.15) * (headR + spikeH * 0.5) + breathOffset * 0.2);
    ctx.lineTo(Math.cos(a + 0.15) * (headR + spikeH * 0.7), -72 * s + Math.sin(a + 0.15) * (headR + spikeH * 0.5) + breathOffset * 0.2);
    ctx.closePath();
    ctx.fill();
  }

  // Torso (lying back, slightly propped)
  ctx.fillStyle = 'rgba(30, 25, 50, 0.55)';
  ctx.beginPath();
  ctx.moveTo(-4 * s, -60 * s + breathOffset * 0.5);
  ctx.quadraticCurveTo(6 * s, -42 * s + breathOffset, 14 * s, -20 * s + breathOffset * 0.3);
  ctx.quadraticCurveTo(10 * s, -16 * s + breathOffset * 0.2, -6 * s, -18 * s + breathOffset * 0.2);
  ctx.quadraticCurveTo(-8 * s, -40 * s + breathOffset * 0.5, -4 * s, -60 * s + breathOffset * 0.5);
  ctx.fill();
  ctx.stroke();

  // Left arm behind head (bent up, relaxed)
  ctx.beginPath();
  ctx.moveTo(0, -55 * s + breathOffset * 0.4);
  ctx.quadraticCurveTo(18 * s, -62 * s + breathOffset * 0.3, 28 * s, -50 * s + breathOffset * 0.2);
  ctx.quadraticCurveTo(30 * s, -44 * s + breathOffset * 0.1, 26 * s, -40 * s + breathOffset * 0.1);
  ctx.fill();
  ctx.stroke();

  // Right arm resting on grass
  ctx.beginPath();
  ctx.moveTo(-2 * s, -44 * s + breathOffset * 0.5);
  ctx.quadraticCurveTo(-16 * s, -36 * s + breathOffset * 0.3, -24 * s, -26 * s + breathOffset * 0.1);
  ctx.quadraticCurveTo(-22 * s, -22 * s + breathOffset * 0.1, -18 * s, -24 * s + breathOffset * 0.1);
  ctx.fill();
  ctx.stroke();

  // Left leg (straight)
  ctx.beginPath();
  ctx.moveTo(10 * s, -18 * s + breathOffset * 0.2);
  ctx.quadraticCurveTo(20 * s, -10 * s + breathOffset * 0.1, 32 * s, -2 * s);
  ctx.quadraticCurveTo(30 * s, 2 * s, 24 * s, 1 * s);
  ctx.quadraticCurveTo(12 * s, -8 * s + breathOffset * 0.1, 4 * s, -14 * s + breathOffset * 0.2);
  ctx.fill();
  ctx.stroke();

  // Right leg (slightly bent at knee)
  ctx.beginPath();
  ctx.moveTo(6 * s, -16 * s + breathOffset * 0.2);
  ctx.quadraticCurveTo(16 * s, -2 * s + breathOffset * 0.1, 20 * s, 8 * s);
  ctx.quadraticCurveTo(14 * s, 12 * s, 8 * s, 6 * s);
  ctx.quadraticCurveTo(2 * s, -4 * s + breathOffset * 0.1, 0, -12 * s + breathOffset * 0.2);
  ctx.fill();
  ctx.stroke();

  // Boots
  ctx.fillStyle = 'rgba(20, 18, 35, 0.65)';
  // Left boot
  ctx.beginPath();
  ctx.ellipse(32 * s, 1 * s, 5 * s, 3 * s, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Right boot
  ctx.beginPath();
  ctx.ellipse(20 * s, 10 * s, 5 * s, 3 * s, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Grass around figure
  ctx.strokeStyle = 'rgba(255, 215, 120, 0.07)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const gx = -30 * s + Math.random() * 70 * s;
    const gh = (8 + Math.random() * 16) * s;
    const sway = Math.sin(Date.now() * 0.0008 + i * 2) * 2 * s;
    ctx.beginPath();
    ctx.moveTo(gx, 4 * s);
    ctx.quadraticCurveTo(gx + sway, -gh * 0.6, gx + sway * 1.5, -gh);
    ctx.stroke();
  }

  ctx.restore();
}

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    const stars: Star[] = Array.from({ length: 80 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      size: Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.5 + 0.1,
      speed: Math.random() * 0.005 + 0.002,
      phase: Math.random() * Math.PI * 2,
    }));

    const particles: Particle[] = Array.from({ length: 30 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      size: Math.random() * 3 + 1,
      alpha: Math.random() * 0.15 + 0.03,
      speedX: (Math.random() - 0.5) * 0.15,
      speedY: -(Math.random() * 0.1 + 0.02),
    }));

    let animId: number;

    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h);

      for (const s of stars) {
        const twinkle = Math.sin(time * s.speed + s.phase) * 0.3 + 0.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 240, ${s.alpha * twinkle})`;
        ctx.fill();
      }

      for (const p of particles) {
        p.x += p.speedX;
        p.y += p.speedY;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10 || p.x > w + 10) { p.x = Math.random() * w; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 215, 120, ${p.alpha})`;
        ctx.fill();
      }

      // Thorfinn silhouette - bottom edge, slightly left of center
      const scale = Math.min(w, h) / 800;
      const cx = w * 0.35;
      const groundY = h - 8;
      const breathPhase = time * 0.001;
      drawThorfinn(ctx, cx, groundY, scale, breathPhase);

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);

    const onResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
