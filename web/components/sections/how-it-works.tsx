import Link from "next/link";
import { Database, Brain, ListOrdered, Sparkles, Check, ArrowRight, Upload, type LucideIcon } from "lucide-react";

import { Reveal } from "@/components/anim/reveal";
import { DataBadge } from "@/components/app/data-badge";
import { cn } from "@/lib/utils";

/*
  Shows the actual pipeline — data in → models score → dashboard ranks → see why
  & act — with a small bespoke diagram inside each stage frame, so a visitor can
  see what happens behind the scenes (not stock photos, not generic icons alone).
*/

// Stage 1 — heterogeneous source rows joining into one order feature row.
function JoinVisual() {
  const sources = ["orders", "deliveries", "payments", "reviews"];
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 space-y-1">
        {sources.map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-primary/50" />
            <span className="h-2 flex-1 rounded-full bg-secondary" />
            <span className="font-mono text-[9px] text-muted-foreground/70">{s}</span>
          </div>
        ))}
      </div>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50" />
      <div className="w-16 shrink-0 rounded-md border border-primary/30 bg-primary/[0.07] p-1.5">
        <div className="h-1.5 w-full rounded-full bg-primary/60" />
        <div className="mt-1 h-1.5 w-3/4 rounded-full bg-primary/30" />
        <p className="mt-1 font-mono text-[8px] text-primary/80">1 row / order</p>
      </div>
    </div>
  );
}

// Stage 2 — calibrated risk meter + two probability chips.
function ScoreVisual() {
  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gradient-to-r from-primary/80 via-amber-300/80 to-rose-400/80">
        <div className="ml-[72%] h-full w-1 bg-foreground/90 shadow-[0_0_6px_hsl(var(--foreground))]" />
      </div>
      <div className="mt-3 flex gap-2">
        <span className="rounded-md border border-rose-400/30 bg-rose-400/10 px-2 py-1 font-mono text-[10px] text-rose-600">
          delay 78%
        </span>
        <span className="rounded-md border border-amber-300/30 bg-amber-300/10 px-2 py-1 font-mono text-[10px] text-amber-600">
          low-review 61%
        </span>
      </div>
    </div>
  );
}

// Stage 3 — a mini ranked queue, riskiest first.
function RankVisual() {
  const rows = [
    { w: "w-full", c: "bg-rose-400", p: "78%" },
    { w: "w-3/4", c: "bg-amber-300", p: "41%" },
    { w: "w-1/3", c: "bg-primary", p: "12%" },
  ];
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className={cn("h-4 w-1 shrink-0 rounded-full", r.c)} />
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
            <div className={cn("h-full rounded-full", r.w, r.c, "opacity-70")} />
          </div>
          <span className="w-8 text-right font-mono text-[10px] tabular-nums text-muted-foreground">{r.p}</span>
        </div>
      ))}
    </div>
  );
}

// Stage 4 — the AI drafts the customer message; you review and send.
function MessageVisual() {
  return (
    <div>
      <div className="rounded-lg border border-primary/20 bg-primary/[0.06] p-2">
        <div className="mb-1 flex items-center gap-1 font-mono text-[8px] font-medium text-primary">
          <Sparkles className="size-2.5" /> AI draft
        </div>
        <div className="space-y-1">
          <div className="h-1.5 w-full rounded-full bg-primary/25" />
          <div className="h-1.5 w-11/12 rounded-full bg-primary/25" />
          <div className="h-1.5 w-2/3 rounded-full bg-primary/25" />
        </div>
      </div>
      <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-700">
        <Check className="size-3" />
        You review &amp; send
      </span>
    </div>
  );
}

const STAGES: {
  icon: LucideIcon;
  step: string;
  title: string;
  body: string;
  Visual: () => React.JSX.Element;
}[] = [
  {
    icon: Database,
    step: "01",
    title: "Order data in",
    body: "Orders, deliveries, payments, and reviews are joined into one clean feature row per order.",
    Visual: JoinVisual,
  },
  {
    icon: Brain,
    step: "02",
    title: "ML scores each order",
    body: "Calibrated models predict delay and low-review risk as real probabilities — not gut feel.",
    Visual: ScoreVisual,
  },
  {
    icon: ListOrdered,
    step: "03",
    title: "Dashboard ranks them",
    body: "Every order lands in a queue sorted riskiest-first, so your team works the orders that matter.",
    Visual: RankVisual,
  },
  {
    icon: Sparkles,
    step: "04",
    title: "AI works the queue",
    body: "The action center triages by priority, drafts the customer message for each at-risk order, and auto-pilots the routine ones — you review and approve.",
    Visual: MessageVisual,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="section relative">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-radial-fade" />
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal className="eyebrow">How it works</Reveal>
          <Reveal index={1}>
            <h2 className="mt-5 text-balance font-display text-display-sm font-bold text-foreground">
              From raw orders to an AI that works the queue for you.
            </h2>
          </Reveal>
          <Reveal index={2}>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
              Four stages, each doing one job well — data in, calibrated scores,
              a ranked queue, and an AI that drafts the outreach. Explainable end
              to end, and live on the demo right now.
            </p>
          </Reveal>
        </div>

        <div className="relative mt-16">
          {/* flow connector across the top on large screens */}
          <div className="absolute left-0 right-0 top-[4.5rem] hidden h-px bg-gradient-to-r from-transparent via-border to-transparent lg:block" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STAGES.map((s, i) => (
              <Reveal key={s.title} index={i} className="h-full">
                <div className="group relative flex h-full flex-col rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm transition-colors hover:border-primary/40">
                  <div className="flex items-center justify-between">
                    <span className="flex size-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary transition-transform duration-300 group-hover:-translate-y-0.5">
                      <s.icon className="size-5" />
                    </span>
                    <span className="font-mono text-sm text-muted-foreground/60">{s.step}</span>
                  </div>
                  <h3 className="mt-5 font-display text-lg font-semibold text-foreground">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>

                  {/* the behind-the-scenes diagram for this stage */}
                  <div className="mt-5 rounded-xl border border-border/50 bg-background/40 p-3.5">
                    <s.Visual />
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal>
          <div className="mx-auto mt-12 flex max-w-3xl flex-col items-center gap-5 rounded-2xl border border-border/60 bg-card/60 p-6 text-center shadow-card sm:p-8">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <DataBadge kind="demo" />
              <ArrowRight className="size-4 text-muted-foreground" />
              <DataBadge kind="yours" />
            </div>
            <h3 className="max-w-xl text-balance font-display text-xl font-semibold text-foreground sm:text-2xl">
              See the whole pipeline on the demo — then run it on your own orders.
            </h3>
            <p className="max-w-lg text-pretty text-sm leading-relaxed text-muted-foreground">
              Every stage above is live and free on ~100k public Olist orders, no sign-up. When
              you&apos;re ready, create a free account and upload your own order export — it&apos;s
              scored in your browser and never stored.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-glow transition-opacity hover:opacity-90"
              >
                Explore the demo <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/connect"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
              >
                <Upload className="size-4" /> Score your orders
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
