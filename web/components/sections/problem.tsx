import { AlertTriangle, ShieldCheck } from "lucide-react";

import { Reveal } from "@/components/anim/reveal";
import { cn } from "@/lib/utils";

const TIMELINE = [
  { label: "Order placed", tone: "ok" },
  { label: "Ships late", tone: "warn" },
  { label: "1★ review", tone: "bad" },
  { label: "Refund / return", tone: "bad" },
  { label: "Customer churns", tone: "bad" },
] as const;

const toneStyles: Record<string, string> = {
  ok: "border-primary/50 bg-primary/10 text-primary",
  warn: "border-amber-400/40 bg-amber-400/10 text-amber-600",
  bad: "border-rose-500/40 bg-rose-500/10 text-rose-600",
};

export function Problem() {
  return (
    <section id="problem" className="section relative">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal className="eyebrow">
            <AlertTriangle className="size-3.5 text-rose-600" />
            The problem
          </Reveal>
          <Reveal index={1}>
            <h2 className="mt-5 text-balance font-display text-display-sm font-extrabold tracking-tight text-foreground">
              By the time you see the problem, you&apos;ve already paid for it.
            </h2>
          </Reveal>
          <Reveal index={2}>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
              Most retailers react to bad orders after the cost is locked in. The
              data that could have warned you was there all along — it just
              wasn&apos;t turned into a decision in time.
            </p>
          </Reveal>
        </div>

        <Reveal index={3} className="mt-16">
          <div className="relative rounded-3xl border border-border/60 bg-card/40 p-6 sm:p-10">
            {/* connecting line */}
            <div className="relative">
              <div className="absolute left-0 right-0 top-5 hidden h-px bg-gradient-to-r from-primary/50 via-amber-400/40 to-rose-500/50 sm:block" />
              <ol className="relative grid grid-cols-1 gap-6 sm:grid-cols-5 sm:gap-4">
                {TIMELINE.map((step, i) => (
                  <li key={step.label} className="flex items-center gap-4 sm:flex-col sm:text-center">
                    <span
                      className={cn(
                        "z-10 flex size-10 shrink-0 items-center justify-center rounded-full border font-mono text-sm",
                        toneStyles[step.tone]
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-foreground/90 sm:mt-1">
                      {step.label}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-10 flex flex-col items-start gap-4 rounded-2xl border border-primary/30 bg-primary/[0.06] p-5 sm:flex-row sm:items-center">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <ShieldCheck className="size-5" />
              </span>
              <p className="text-sm leading-relaxed text-foreground/90">
                <span className="font-semibold text-primary">Veridian acts at step one.</span>{" "}
                It scores the order the moment it&apos;s placed — so you can
                intervene while prevention is still cheap, not after the refund.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
