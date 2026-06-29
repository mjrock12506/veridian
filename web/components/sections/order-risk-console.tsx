"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Package, Truck, ChevronRight } from "lucide-react";

import type { RiskLevel } from "@/lib/api";
import { riskBadgeClass } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
  The signature hero visual: a stylized preview of what Veridian actually does.
  Order cards arrive in the intake slot, get scanned and scored, are stamped with
  a calibrated risk badge, and drop into a risk-ranked "flagged" queue. Every
  moving element is a real order with a real score — the motion IS the product,
  not decoration. Rendered in DOM/SVG so it's light and matches the dashboard.
*/

type DemoOrder = {
  id: string;
  route: string;
  category: string;
  value: string;
  delay: number; // calibrated delivery-delay probability (0–1)
  review: number; // calibrated low-review probability (0–1)
  level: RiskLevel;
};

// Olist-flavored sample orders (Brazilian states, categories, BRL) so the
// preview reads as the real domain, not placeholder lorem.
const ORDERS: DemoOrder[] = [
  { id: "a1b2c3d4e9", route: "SP → AM", category: "electronics", value: "R$ 489", delay: 0.78, review: 0.61, level: "high" },
  { id: "0c1d2e3f4a", route: "PR → BA", category: "toys", value: "R$ 167", delay: 0.54, review: 0.39, level: "high" },
  { id: "f7e6d5c4b3", route: "MG → RS", category: "furniture", value: "R$ 1.240", delay: 0.31, review: 0.24, level: "medium" },
  { id: "9a8b7c6d5e", route: "SP → SP", category: "health & beauty", value: "R$ 89", delay: 0.07, review: 0.05, level: "low" },
];

// The persistent "flagged for review" queue, ranked riskiest-first.
const QUEUE = [...ORDERS].sort((a, b) => b.delay - a.delay);

const levelBar: Record<RiskLevel, string> = {
  high: "bg-rose-400",
  medium: "bg-amber-300",
  low: "bg-primary",
};

const levelText: Record<RiskLevel, string> = {
  high: "High risk",
  medium: "Medium",
  low: "Low risk",
};

const ease = [0.16, 1, 0.3, 1] as const;

function pctLabel(p: number) {
  return `${Math.round(p * 100)}%`;
}

export function OrderRiskConsole() {
  const reduce = useReducedMotion();
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setActive((i) => (i + 1) % ORDERS.length), 2900);
    return () => clearInterval(t);
  }, [reduce]);

  const order = ORDERS[active];

  return (
    <div className="relative w-full">
      {/* faint grid + glow behind the panel, masked at the edges */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-grid-faint bg-[size:32px_32px] opacity-[0.25] [mask-image:radial-gradient(ellipse_70%_70%_at_50%_40%,#000_40%,transparent_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-10 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_60%_10%,hsl(var(--primary)/0.22),transparent_70%)]"
      />

      <div className="rounded-2xl border border-border/70 bg-card/80 shadow-[0_30px_80px_-32px_hsl(var(--primary)/0.45)] backdrop-blur-xl">
        {/* console chrome */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Package className="size-4" />
            </span>
            <div className="leading-tight">
              <p className="font-display text-sm font-semibold text-foreground">Order triage</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                live demo · olist orders
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
            <span className="relative flex size-1.5">
              {!reduce && (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/70" />
              )}
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </span>
            scoring
          </span>
        </div>

        {/* intake slot — the order currently being scored */}
        <div className="px-4 pb-2 pt-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Incoming order
          </p>
          <div className="relative h-[132px]">
            {/* stacked "queued behind" hints for depth */}
            <div aria-hidden className="absolute inset-x-3 top-2 h-full rounded-xl border border-border/40 bg-card/40" />
            <div aria-hidden className="absolute inset-x-1.5 top-1 h-full rounded-xl border border-border/50 bg-card/60" />

            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={order.id}
                initial={reduce ? false : { opacity: 0, y: -14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? undefined : { opacity: 0, y: 16, scale: 0.97 }}
                transition={{ duration: 0.5, ease }}
                className="absolute inset-0 overflow-hidden rounded-xl border border-border/70 bg-gradient-to-b from-secondary/60 to-card p-3.5"
              >
                {/* scanning sweep */}
                {!reduce && (
                  <motion.div
                    key={`scan-${order.id}`}
                    aria-hidden
                    initial={{ y: "-100%", opacity: 0 }}
                    animate={{ y: "260%", opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 1.1, ease: "easeInOut", delay: 0.25 }}
                    className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-transparent via-primary/25 to-transparent"
                  />
                )}

                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-mono text-xs text-foreground/90">#{order.id}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Truck className="size-3.5" />
                      {order.route}
                      <span className="text-muted-foreground/50">·</span>
                      {order.category}
                    </p>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-foreground/80">{order.value}</span>
                </div>

                {/* calibrated risk meter */}
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      Delay risk
                    </span>
                    <motion.span
                      key={`pct-${order.id}`}
                      initial={reduce ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.9 }}
                      className="font-mono text-xs tabular-nums text-foreground"
                    >
                      {pctLabel(order.delay)}
                    </motion.span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <motion.div
                      key={`fill-${order.id}`}
                      initial={reduce ? false : { width: 0 }}
                      animate={{ width: `${order.delay * 100}%` }}
                      transition={{ duration: 0.9, ease, delay: 0.2 }}
                      className={cn("h-full rounded-full", levelBar[order.level])}
                    />
                  </div>
                </div>

                {/* stamped verdict */}
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    low-review {pctLabel(order.review)}
                  </span>
                  <motion.span
                    key={`badge-${order.id}`}
                    initial={reduce ? false : { opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.35, ease, delay: 1 }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
                      riskBadgeClass[order.level]
                    )}
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                    {levelText[order.level]}
                  </motion.span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* ranked queue — flagged for review */}
        <div className="border-t border-border/60 px-4 pb-4 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Flagged for review
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
              ranked by risk
            </p>
          </div>
          <ul className="space-y-1.5">
            {QUEUE.map((o) => {
              const isActive = o.id === order.id;
              return (
                <li
                  key={o.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-2.5 py-2 transition-colors",
                    isActive
                      ? "border-primary/40 bg-primary/[0.07]"
                      : "border-transparent bg-secondary/30"
                  )}
                >
                  <span className={cn("h-7 w-1 shrink-0 rounded-full", levelBar[o.level])} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-foreground/90">#{o.id}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {o.route} · {o.category}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
                    <span className={cn(
                      "rounded px-1.5 py-0.5",
                      o.level === "high" ? "text-rose-600" : o.level === "medium" ? "text-amber-600" : "text-primary"
                    )}>
                      {pctLabel(o.delay)}
                    </span>
                  </div>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
