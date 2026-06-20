"use client";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Hero3D } from "@/components/three/hero-3d";

const STATS = [
  { value: "0.78", label: "ROC-AUC, held-out" },
  { value: "~100k", label: "orders modeled" },
  { value: "Calibrated", label: "probabilities" },
];

const ease = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* faint grid + 3D globe behind the content */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid-faint bg-[size:48px_48px] opacity-[0.35] mask-radial" />
      <Hero3D />

      <div className="container relative flex min-h-[92vh] flex-col items-center justify-center pt-28 pb-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
          className="eyebrow"
        >
          <Sparkles className="size-3.5 text-primary" />
          Order Intelligence Platform
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease, delay: 0.06 }}
          className="mt-6 max-w-4xl text-balance font-display text-display-lg font-bold text-foreground"
        >
          Stop losing money to <span className="text-gradient">bad orders.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease, delay: 0.14 }}
          className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl"
        >
          Predict and prevent late deliveries, unhappy customers, and returns —
          before they happen. Veridian scores every order and tells your team
          exactly what to do about it.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease, delay: 0.22 }}
          className="mt-10 flex flex-col items-center gap-3 sm:flex-row"
        >
          <Button size="lg" asChild>
            <a href="/dashboard">
              View live demo
              <ArrowRight className="size-4" />
            </a>
          </Button>
          <Button size="lg" variant="secondary" asChild>
            <a href="#how-it-works">See how it works</a>
          </Button>
          <Button size="lg" variant="ghost" asChild>
            <a href="/login">Sign in</a>
          </Button>
        </motion.div>

        <motion.dl
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease, delay: 0.32 }}
          className="mt-16 grid w-full max-w-lg grid-cols-3 gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/40"
        >
          {STATS.map((s) => (
            <div key={s.label} className="bg-card/70 px-4 py-5 backdrop-blur">
              <dt className="font-display text-xl font-semibold text-foreground sm:text-2xl">
                {s.value}
              </dt>
              <dd className="mt-1 text-xs text-muted-foreground">{s.label}</dd>
            </div>
          ))}
        </motion.dl>
      </div>

      {/* fade into the next section */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
    </section>
  );
}
