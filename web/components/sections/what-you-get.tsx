import { LayoutDashboard, MessagesSquare, Users, LineChart, type LucideIcon } from "lucide-react";

import { Reveal } from "@/components/anim/reveal";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const BENEFITS: {
  icon: LucideIcon;
  title: string;
  benefit: string;
  span?: boolean;
}[] = [
  {
    icon: LayoutDashboard,
    title: "Risk dashboard",
    benefit: "See every at-risk order ranked by calibrated probability, with the why behind each score.",
    span: true,
  },
  {
    icon: MessagesSquare,
    title: "AI copilot",
    benefit: "Ask questions in plain language and get grounded answers backed by the real models.",
  },
  {
    icon: Users,
    title: "Customer segments",
    benefit: "Group buyers by behavior and value to target retention where it pays off.",
  },
  {
    icon: LineChart,
    title: "Demand forecasts",
    benefit: "Anticipate volume so operations and inventory stay ahead of the curve.",
    span: true,
  },
];

export function WhatYouGet() {
  return (
    <section id="benefits" className="section relative">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal className="eyebrow">What you get</Reveal>
          <Reveal index={1}>
            <h2 className="mt-5 text-balance font-display text-display-sm font-bold text-foreground">
              One platform, from prediction to action.
            </h2>
          </Reveal>
          <Reveal index={2}>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
              Everything an operations team needs to catch bad orders early and
              act with confidence.
            </p>
          </Reveal>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {BENEFITS.map((b, i) => (
            <Reveal
              key={b.title}
              index={i}
              className={b.span ? "md:col-span-2" : "md:col-span-1"}
            >
              <Card className="group h-full hover:-translate-y-1 hover:border-primary/40 hover:shadow-card-hover">
                <CardHeader>
                  <span className="mb-3 flex size-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-105">
                    <b.icon className="size-5" />
                  </span>
                  <CardTitle>{b.title}</CardTitle>
                  <CardDescription className="mt-1 text-base">{b.benefit}</CardDescription>
                </CardHeader>
                <span className="mt-5 inline-flex font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground/60">
                  Preview coming soon
                </span>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
