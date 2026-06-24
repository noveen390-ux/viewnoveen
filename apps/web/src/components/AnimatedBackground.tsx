"use client";

import { useEffect, useMemo, useState } from "react";

interface Star {
  id: number;
  left: string;
  top: string;
  size: number;
  duration: number;
  delay: number;
}

interface Particle {
  id: number;
  left: string;
  size: number;
  duration: number;
  delay: number;
  color: string;
}

const STAR_COUNT = 18;
const PARTICLE_COUNT = 8;
const PARTICLE_COLORS = ["#fbbf24", "#fde68a", "#ffffff"];

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export default function AnimatedBackground() {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const stars = useMemo<Star[]>(
    () =>
      Array.from({ length: STAR_COUNT }, (_, i) => ({
        id: i,
        left: `${randomBetween(0, 100)}%`,
        top: `${randomBetween(0, 100)}%`,
        size: randomBetween(1, 2.2),
        duration: randomBetween(2.5, 5),
        delay: randomBetween(0, 4),
      })),
    [],
  );

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        id: i,
        left: `${randomBetween(0, 100)}%`,
        size: randomBetween(2, 4),
        duration: randomBetween(16, 28),
        delay: randomBetween(0, 20),
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      })),
    [],
  );

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {stars.map((s) => (
        <span
          key={`star-${s.id}`}
          className="absolute rounded-full bg-white"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animation: `anime-bg-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
            animationPlayState: paused ? "paused" : "running",
            willChange: "opacity",
          }}
        />
      ))}
      {particles.map((p) => (
        <span
          key={`particle-${p.id}`}
          className="absolute rounded-full"
          style={{
            left: p.left,
            bottom: -10,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animation: `anime-bg-float ${p.duration}s linear ${p.delay}s infinite`,
            animationPlayState: paused ? "paused" : "running",
            willChange: "transform, opacity",
          }}
        />
      ))}

      <div
        className="planet-earth"
        style={{ animationPlayState: paused ? "paused" : "running" }}
      />

      <style>{`
        @keyframes anime-bg-twinkle {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 0.9; }
        }
        @keyframes anime-bg-float {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: 0.5; }
          90% { opacity: 0.5; }
          100% { transform: translateY(-110vh); opacity: 0; }
        }
        @keyframes planet-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes planet-glow {
          0% { opacity: 0.4; transform: scale(1); }
          100% { opacity: 0.7; transform: scale(1.04); }
        }
        .planet-earth {
          position: absolute;
          bottom: -8%;
          right: -6%;
          width: min(55vw, 460px);
          height: min(55vw, 460px);
          border-radius: 50%;
          background:
            radial-gradient(ellipse at 18% 45%, rgba(251,191,36,0.25) 0%, transparent 22%),
            radial-gradient(ellipse at 52% 28%, rgba(245,158,11,0.2) 0%, transparent 18%),
            radial-gradient(ellipse at 72% 55%, rgba(251,191,36,0.15) 0%, transparent 20%),
            radial-gradient(ellipse at 38% 72%, rgba(245,158,11,0.18) 0%, transparent 16%),
            radial-gradient(ellipse at 60% 80%, rgba(251,191,36,0.12) 0%, transparent 14%),
            radial-gradient(ellipse at 82% 35%, rgba(245,158,11,0.1) 0%, transparent 12%),
            radial-gradient(circle at 40% 35%, #1a4a6e 0%, #0d2137 40%, #071526 100%);
          box-shadow:
            0 0 80px rgba(251,191,36,0.08),
            0 0 160px rgba(245,158,11,0.04),
            inset 0 0 80px rgba(251,191,36,0.03);
          animation: planet-spin 120s linear infinite;
          willChange: transform;
          z-index: -1;
        }
        .planet-earth::before {
          content: '';
          position: absolute;
          inset: -6%;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 40%, rgba(251,191,36,0.07) 0%, transparent 65%);
          animation: planet-glow 6s ease-in-out infinite alternate;
          willChange: transform, opacity;
        }
        @media (max-width: 640px) {
          .planet-earth {
            width: min(70vw, 280px);
            height: min(70vw, 280px);
            bottom: -5%;
            right: -10%;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          span, .planet-earth, .planet-earth::before { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
