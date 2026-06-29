import Link from "next/link";
import {
  LayoutDashboard,
  FileSearch,
  MessagesSquare,
  SlidersHorizontal,
  Users,
  LineChart,
  Store,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

import { Reveal } from "@/components/anim/reveal";
import { cn } from "@/lib/utils";

/*
  "What you can do" — concrete steps in the order a first-time visitor should
  take them. Step 01 is marked "Start here" so the first click is obvious. These
  are a real recommended sequence, so numbered markers carry meaning.
*/

const STEPS: {
  icon: LucideIcon;
  step: string;
  title: string;
  href: string;
  cta: string;
  body: string;
  start?: boolean;
}[] = [
  {
    icon: LayoutDashboard,
    step: "01",
    title: "Explore the risk dashboard",
    href: "/dashboard",
    cta: "Open the dashboard",
    body: "See ~100k orders ranked by risk, with portfolio stats up top. This is the best place to start.",
    start: true,
  },
  {
    icon: FileSearch,
    step: "02",
    title: "Drill into a risky order",
    href: "/dashboard",
    cta: "Open an order",
    body: "Click any order to see the calibrated probabilities and the top features driving them — the score is never a black box.",
  },
  {
    icon: MessagesSquare,
    step: "03",
    title: "Ask the copilot",
    href: "/copilot",
    cta: "Ask a question",
    body: "Ask in plain English — “which states have the worst delays?” — and get an answer grounded in the real model results.",
  },
  {
    icon: SlidersHorizontal,
    step: "04",
    title: "Score a new order",
    href: "/score",
    cta: "Score an order",
    body: "Enter an order’s details and get a live prediction — delay and low-review probability with a calibrated risk level.",
  },
  {
    icon: Users,
    step: "05",
    title: "Group customers into segments",
    href: "/segments",
    cta: "View segments",
    body: "See buyers grouped by lifetime value and loyalty, each with a recommended retention action — and where revenue concentrates.",
  },
  {
    icon: LineChart,
    step: "06",
    title: "Forecast demand",
    href: "/forecast",
    cta: "View the forecast",
    body: "Project monthly order volume forward with a transparent trend baseline and an honest uncertainty band.",
  },
  {
    icon: Store,
    step: "07",
    title: "Connect your store",
    href: "/connect",
    cta: "Score your orders",
    body: "Paste or upload your own orders as a CSV and score every one with the same calibrated models — no sign-up.",
  },
];

export function DemoGuide() {
  return (
    <section id="explore" className="section relative">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal className="eyebrow">What you can do</Reveal>
          <Reveal index={1}>
            <h2 className="mt-5 text-balance font-display text-display-sm font-bold text-foreground">
              Seven things to try — start with the dashboard.
            </h2>
          </Reveal>
          <Reveal index={2}>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
              No sign-up required. Every page is live and runs on real data — work
              through them in order, or jump straight to whatever you need.
            </p>
          </Reveal>
        </div>

        <div className="mt-16 grid gap-5 sm:grid-cols-2">
          {STEPS.map((p, i) => (
            <Reveal key={p.title} index={i} className="h-full">
              <Link
                href={p.href}
                className={cn(
                  "group flex h-full flex-col rounded-2xl border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover",
                  p.start
                    ? "border-primary/40 bg-primary/[0.04] hover:border-primary/60"
                    : "border-border/60 hover:border-primary/40"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-105">
                    <p.icon className="size-5" />
                  </span>
                  <div className="flex items-center gap-2">
                    {p.start && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
                        <span className="size-1.5 rounded-full bg-primary" />
                        Start here
                      </span>
                    )}
                    <span className="font-mono text-sm text-muted-foreground/60">{p.step}</span>
                  </div>
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold text-foreground">{p.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  {p.cta}
                  <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
