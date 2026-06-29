import { ArrowRight, Database, Sparkles, Zap } from "lucide-react";

import { Reveal } from "@/components/anim/reveal";
import { SOURCES, DESTINATIONS, type Connector } from "@/lib/connectors";

/*
  The full pipeline at a glance: data flows IN from where orders live, Veridian
  scores + triages, and actions flow OUT to the tools the team already uses. Makes
  the "where does it connect / where do actions go" story obvious to a visitor.
*/

export function Connectors() {
  return (
    <section id="connectors" className="section relative">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal className="eyebrow justify-center">
            <Database className="size-3.5 text-primary" /> Connect your stack
          </Reveal>
          <Reveal index={1}>
            <h2 className="mt-5 text-balance font-display text-display-sm font-extrabold tracking-tight text-foreground">
              Plugs into where your orders live — and where your team works.
            </h2>
          </Reveal>
          <Reveal index={2}>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
              Orders flow in from your store. Veridian scores and triages every one. Actions flow
              out to the tools you already use — no new dashboard to babysit.
            </p>
          </Reveal>
        </div>

        <Reveal index={2}>
          <div className="mt-12 grid items-center gap-4 lg:grid-cols-[1fr_auto_1.05fr_auto_1fr]">
            <Stack step="1" title="Your data" subtitle="Pulled in automatically" items={SOURCES} />

            <Connector_Arrow />

            <div className="flex flex-col items-center justify-center rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center shadow-card">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-glow">
                <Sparkles className="size-6" />
              </span>
              <p className="mt-3 font-display text-base font-semibold text-foreground">Veridian AI</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Scores every order, triages by risk, then drafts &amp; routes the action.
              </p>
              <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-[0.7rem] font-medium text-primary">
                <Zap className="size-3" /> AI Action Center
              </span>
            </div>

            <Connector_Arrow />

            <Stack step="3" title="Your tools" subtitle="Actions delivered here" items={DESTINATIONS} />
          </div>
        </Reveal>

        <Reveal index={3}>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Connectors shown are illustrative for the demo; data flows in via CSV today, with
            OAuth integrations on the roadmap.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function Stack({ step, title, subtitle, items }: { step: string; title: string; subtitle: string; items: Connector[] }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-card">
      <div className="mb-3">
        <span className="font-mono text-[0.7rem] uppercase tracking-wide text-primary">Step {step}</span>
        <p className="font-display text-base font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ul className="space-y-2">
        {items.map((c) => (
          <li key={c.id} className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-secondary/30 px-3 py-2">
            <c.icon className={`size-4 shrink-0 ${c.color}`} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
              <span className="block truncate text-[0.7rem] text-muted-foreground">{c.blurb}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Connector_Arrow() {
  return (
    <div className="flex items-center justify-center py-1 lg:py-0">
      <ArrowRight className="size-6 rotate-90 text-muted-foreground/40 lg:rotate-0" />
    </div>
  );
}
