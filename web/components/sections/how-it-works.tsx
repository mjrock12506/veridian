import { Database, Activity, Bot, Zap, type LucideIcon } from "lucide-react";

import { Reveal } from "@/components/anim/reveal";

const STEPS: { icon: LucideIcon; step: string; title: string; body: string }[] = [
  {
    icon: Database,
    step: "01",
    title: "Your data",
    body: "Orders, deliveries, payments, and reviews flow into a clean, joined feature warehouse.",
  },
  {
    icon: Activity,
    step: "02",
    title: "Models predict risk",
    body: "Calibrated models score each order for delay and dissatisfaction risk against a baseline.",
  },
  {
    icon: Bot,
    step: "03",
    title: "Copilot explains",
    body: "An AI copilot grounds every answer in your data and the model results — and recommends an action.",
  },
  {
    icon: Zap,
    step: "04",
    title: "You act",
    body: "Flag at-risk orders, reroute, or reach out — while prevention is still cheaper than the refund.",
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
              From raw orders to prevented losses, in four steps.
            </h2>
          </Reveal>
          <Reveal index={2}>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
              A clean pipeline from data to decision — each layer doing one job
              well, so the system stays explainable end to end.
            </p>
          </Reveal>
        </div>

        <div className="relative mt-16">
          {/* horizontal connector on large screens */}
          <div className="absolute left-0 right-0 top-9 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent lg:block" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} index={i} className="h-full">
                <div className="group relative h-full rounded-2xl border border-border/60 bg-card/50 p-6 backdrop-blur-sm transition-colors hover:border-primary/40">
                  <div className="flex items-center justify-between">
                    <span className="flex size-12 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary transition-transform duration-300 group-hover:-translate-y-0.5">
                      <s.icon className="size-5" />
                    </span>
                    <span className="font-mono text-sm text-muted-foreground/70">{s.step}</span>
                  </div>
                  <h3 className="mt-5 font-display text-lg font-semibold text-foreground">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {s.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
