import { Database, Store } from "lucide-react";

import { Reveal } from "@/components/anim/reveal";
import { Badge } from "@/components/ui/badge";

/*
  Honesty about data: the demo runs on a public dataset; using your own store's
  orders is the production path (roadmap). Two plain-spoken panels, no overclaim.
*/

export function DataNote() {
  return (
    <section id="data" className="section relative">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal className="eyebrow">
            <Database className="size-3.5 text-primary" />
            About the data
          </Reveal>
          <Reveal index={1}>
            <h2 className="mt-5 text-balance font-display text-display-sm font-bold text-foreground">
              Real data now, your data next.
            </h2>
          </Reveal>
        </div>

        <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
          {/* what you're seeing today */}
          <Reveal className="h-full">
            <div className="flex h-full flex-col rounded-2xl border border-primary/30 bg-primary/[0.05] p-6">
              <div className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                  <Database className="size-5" />
                </span>
                <Badge className="border-primary/30 bg-primary/10 text-primary">
                  <span className="size-1.5 rounded-full bg-primary" />
                  Live demo
                </Badge>
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold text-foreground">
                The demo: a public dataset
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Everything here runs on the{" "}
                <span className="text-foreground/90">Olist</span> dataset — about{" "}
                <span className="text-foreground/90">100,000 real Brazilian
                e-commerce orders</span> (2016–2018), with deliveries, payments,
                and reviews. The models, explanations, and copilot are all
                computed on that data. You browse it as a guest — no sign-up,
                nothing to install.
              </p>
            </div>
          </Reveal>

          {/* the production path */}
          <Reveal index={1} className="h-full">
            <div className="flex h-full flex-col rounded-2xl border border-dashed border-border/70 bg-card/30 p-6">
              <div className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl border border-border/60 bg-secondary/40 text-muted-foreground">
                  <Store className="size-5" />
                </span>
                <Badge className="border-border/60 bg-secondary/40 uppercase tracking-[0.16em] text-muted-foreground/80">
                  Roadmap
                </Badge>
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold text-foreground/90">
                In production: your own store
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                The same pipeline is built to ingest{" "}
                <span className="text-foreground/80">your store&apos;s own
                orders</span> — your catalog, your routes, your customers — and
                retrain on them, so the risk scores reflect how your business
                actually ships. Connecting a live order source is the next step,
                not something the demo does today.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
