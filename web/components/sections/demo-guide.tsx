import Link from "next/link";
import {
  LayoutDashboard,
  FileSearch,
  MessagesSquare,
  SlidersHorizontal,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

import { Reveal } from "@/components/anim/reveal";
import { Badge } from "@/components/ui/badge";

const PAGES: {
  icon: LucideIcon;
  title: string;
  href: string;
  cta: string;
  body: string;
}[] = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    href: "/dashboard",
    cta: "Open dashboard",
    body: "Every order ranked by risk. Scan the riskiest orders first, with calibrated delay and low-review probabilities and portfolio-level stats up top.",
  },
  {
    icon: FileSearch,
    title: "Order detail",
    href: "/dashboard",
    cta: "Open an order",
    body: "Click any order to see why it's risky — the top features driving each prediction, so the score is never a black box.",
  },
  {
    icon: MessagesSquare,
    title: "AI Copilot",
    href: "/copilot",
    cta: "Ask the copilot",
    body: "Ask questions in plain English — “which states have the worst delays?” — and get answers grounded in the real model results.",
  },
  {
    icon: SlidersHorizontal,
    title: "Score an order",
    href: "/score",
    cta: "Score an order",
    body: "Enter an order's details and get a live prediction — delay and low-review probability with a calibrated risk level, computed by the models on the spot.",
  },
];

export function DemoGuide() {
  return (
    <section id="explore" className="section relative">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal className="eyebrow">How to use the demo</Reveal>
          <Reveal index={1}>
            <h2 className="mt-5 text-balance font-display text-display-sm font-bold text-foreground">
              Four pages. No sign-up. Click around.
            </h2>
          </Reveal>
          <Reveal index={2}>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">What you&apos;re looking at:</span>{" "}
              a working demo built on the public Olist e-commerce dataset
              (~100k Brazilian orders). The models, the explanations, and the
              copilot all run on real data — here&apos;s what each page does.
            </p>
          </Reveal>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2">
          {PAGES.map((p, i) => (
            <Reveal key={p.title} index={i} className="h-full">
              <Link
                href={p.href}
                className="group flex h-full flex-col rounded-2xl border border-border/60 bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-card-hover"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-105">
                    <p.icon className="size-5" />
                  </span>
                  <Badge className="border-primary/30 bg-primary/10 text-primary">
                    <span className="size-1.5 rounded-full bg-primary" />
                    Live
                  </Badge>
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold text-foreground">
                  {p.title}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {p.body}
                </p>
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
