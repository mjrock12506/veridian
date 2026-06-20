import { ArrowRight } from "lucide-react";

import { Reveal } from "@/components/anim/reveal";
import { Button } from "@/components/ui/button";

export function ClosingCta() {
  return (
    <section className="section">
      <div className="container">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-b from-card/80 to-card/40 px-6 py-16 text-center sm:px-12 sm:py-20">
            {/* glow accents */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_0%,hsl(var(--primary)/0.18),transparent_70%)]" />
            <div className="pointer-events-none absolute -top-px left-1/2 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-primary/70 to-transparent" />

            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-balance font-display text-display-sm font-bold text-foreground">
                Turn order data into prevented losses.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
                Stop reacting to bad orders after the refund. Start scoring them
                the moment they&apos;re placed.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <a href="/dashboard">
                    Try the demo
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
                <Button size="lg" variant="secondary" asChild>
                  <a href="#explore">How to use the demo</a>
                </Button>
              </div>
              <p className="mt-6 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground/60">
                No credit card · Demo environment
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
