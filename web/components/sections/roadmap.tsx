import { BellRing, RefreshCw, type LucideIcon } from "lucide-react";

import { Reveal } from "@/components/anim/reveal";
import { Badge } from "@/components/ui/badge";

const PLANNED: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: BellRing,
    title: "Automated alerts",
    body: "Push a Slack or email alert the moment an order in your latest upload crosses its risk threshold.",
  },
  {
    icon: RefreshCw,
    title: "Scheduled re-scoring",
    body: "Re-upload your order export on a schedule and track how each order's risk shifts week over week.",
  },
];

export function Roadmap() {
  return (
    <section id="roadmap" className="section relative">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal className="eyebrow">Roadmap</Reveal>
          <Reveal index={1}>
            <h2 className="mt-5 text-balance font-display text-display-sm font-bold text-foreground">
              What&apos;s next
            </h2>
          </Reveal>
          <Reveal index={2}>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
              Customer segments, demand forecasts, and bring-your-own-orders
              scoring are now live. These are the next planned extensions — not
              yet built, listed here for honesty about scope.
            </p>
          </Reveal>
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl gap-6 sm:grid-cols-2">
          {PLANNED.map((item, i) => (
            <Reveal key={item.title} index={i} className="h-full">
              <div className="flex h-full flex-col rounded-2xl border border-dashed border-border/70 bg-card/30 p-6">
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-xl border border-border/60 bg-secondary/40 text-muted-foreground">
                    <item.icon className="size-5" />
                  </span>
                  <Badge className="border-border/60 bg-secondary/40 uppercase tracking-[0.16em] text-muted-foreground/80">
                    Planned
                  </Badge>
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold text-foreground/90">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
