"use client";

import { motion } from "framer-motion";
import { ArrowRight, PackageSearch, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OrderRiskConsole } from "@/components/sections/order-risk-console";

const ease = [0.16, 1, 0.3, 1] as const;

const PROOF = [
  { value: "~100k", label: "real orders scored" },
  { value: "0.78", label: "ROC-AUC, held-out" },
  { value: "2", label: "risk models + copilot" },
];

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* faint grid wash behind the whole hero */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid-faint bg-[size:56px_56px] opacity-[0.18] [mask-image:radial-gradient(ellipse_90%_70%_at_50%_0%,#000_30%,transparent_85%)]" />

      <div className="container grid items-center gap-12 pb-20 pt-32 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pb-28 lg:pt-36">
        {/* left: the thesis */}
        <div className="max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
            className="eyebrow"
          >
            <PackageSearch className="size-3.5 text-primary" />
            Order risk intelligence
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease, delay: 0.06 }}
            className="mt-6 text-balance font-display text-display font-bold leading-[1.05] text-foreground"
          >
            Predict which e-commerce orders will{" "}
            <span className="text-gradient">go wrong</span> — before they do — and
            know how to fix them.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease, delay: 0.14 }}
            className="mt-6 max-w-lg text-pretty text-lg leading-relaxed text-muted-foreground"
          >
            Built for e-commerce operations and fulfillment teams. Veridian scores
            every order the moment it&apos;s placed — flagging likely late
            deliveries and unhappy customers while there&apos;s still time to act.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease, delay: 0.22 }}
            className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Button size="lg" asChild>
              <a href="/dashboard">
                Explore the demo
                <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <a href="/connect">
                <Upload className="size-4" />
                Score your orders
              </a>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease, delay: 0.3 }}
            className="mt-6 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:gap-6"
          >
            <span className="inline-flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full bg-amber-500" />
              <span><strong className="font-medium text-foreground">Demo</strong> — ~100k public Olist orders, no sign-up</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
              <span><strong className="font-medium text-foreground">Your data</strong> — scored in your browser, never stored</span>
            </span>
          </motion.div>

          <motion.dl
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease, delay: 0.38 }}
            className="mt-10 grid max-w-md grid-cols-3 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/40"
          >
            {PROOF.map((s) => (
              <div key={s.label} className="bg-card/70 px-3 py-4 backdrop-blur">
                <dt className="font-display text-xl font-semibold tabular-nums text-foreground">
                  {s.value}
                </dt>
                <dd className="mt-1 text-[11px] leading-snug text-muted-foreground">{s.label}</dd>
              </div>
            ))}
          </motion.dl>
        </div>

        {/* right: the signature live console */}
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, ease, delay: 0.2 }}
          className="mx-auto w-full max-w-md lg:mx-0 lg:max-w-none"
        >
          <OrderRiskConsole />
        </motion.div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />
    </section>
  );
}
