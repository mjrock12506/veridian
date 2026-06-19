"use client";

import dynamic from "next/dynamic";

/** Gradient placeholder shown during SSR and while the canvas loads. */
function HeroPlaceholder() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="h-[70%] w-[70%] animate-pulse-glow rounded-full bg-[radial-gradient(circle_at_50%_50%,hsl(var(--primary)/0.28),transparent_60%)] blur-2xl" />
    </div>
  );
}

// WebGL is client-only; load the canvas without SSR and show the placeholder meanwhile.
const HeroCanvas = dynamic(() => import("./hero-canvas"), {
  ssr: false,
  loading: () => <HeroPlaceholder />,
});

export function Hero3D() {
  return (
    <div className="pointer-events-none absolute inset-0 mask-radial" aria-hidden>
      <HeroCanvas />
    </div>
  );
}
