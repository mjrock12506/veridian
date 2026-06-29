import Link from "next/link";
import { Zap, ListChecks, Mail, Check, ArrowRight, ShieldCheck, Bot, type LucideIcon } from "lucide-react";

import { Reveal } from "@/components/anim/reveal";

/*
  Homepage spotlight for the differentiator. Plain-language: what the AI Action
  Center does and how a non-technical user works it, with a realistic mock so the
  value is obvious at a glance — not buried inside the app.
*/

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ListChecks,
    title: "The AI triages your orders",
    body: "Every at-risk order is ranked by priority — High first — so your team works what matters instead of scrolling a 10,000-row spreadsheet.",
  },
  {
    icon: Mail,
    title: "It drafts the outreach for you",
    body: "For each order it recommends the play (expedite shipping, reach out to the customer) and writes the customer message itself.",
  },
  {
    icon: Check,
    title: "You review & send",
    body: "Edit anything, hit send — or let auto-pilot clear the routine ones. Nothing is sent automatically; you're always in control.",
  },
];

export function ActionCenter() {
  return (
    <section id="action-center" className="section relative">
      <div className="container">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <Reveal className="eyebrow">
              <Zap className="size-3.5 text-primary" /> AI Action Center
            </Reveal>
            <Reveal index={1}>
              <h2 className="mt-5 text-balance font-display text-display-sm font-bold text-foreground">
                It doesn&apos;t just predict — it works the queue for you.
              </h2>
            </Reveal>
            <Reveal index={2}>
              <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
                Most tools hand you a risk score and stop. Veridian&apos;s Action Center turns
                that score into <span className="font-medium text-foreground">done</span> —
                triaging, drafting, and clearing at-risk orders so a small team stays ahead of
                every order.
              </p>
            </Reveal>

            <div className="mt-8 space-y-5">
              {STEPS.map((s, i) => (
                <Reveal key={s.title} index={i}>
                  <div className="flex gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 font-display text-sm font-bold text-primary">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
                        <s.icon className="size-4 text-primary" /> {s.title}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal index={3}>
              <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
                <Link
                  href="/actions"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-glow transition-opacity hover:opacity-90"
                >
                  Open the Action Center <ArrowRight className="size-4" />
                </Link>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5 text-emerald-600" /> You approve every message — nothing auto-sends.
                </span>
              </div>
            </Reveal>
          </div>

          <Reveal index={2}>
            <ActionMock />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function ActionMock() {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <Bot className="size-4 text-primary" /> AI Action Center · priority queue
      </div>
      <div className="rounded-xl border border-border/60 bg-secondary/30 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-rose-500/10 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wide text-rose-700">
            High priority
          </span>
          <span className="font-mono text-xs text-foreground/80">#a1b2c3d4</span>
          <span className="ml-auto flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">78%</span>
            <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase text-rose-700">delay</span>
          </span>
        </div>
        <p className="mt-2.5 text-sm font-medium text-foreground">Expedite shipping + notify the customer</p>
        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/[0.06] p-3">
          <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[0.6rem] font-medium uppercase text-primary">
            <Mail className="size-3" /> AI draft · to the customer
          </div>
          <p className="text-xs leading-relaxed text-foreground/90">
            Hi! We&apos;re keeping a close eye on your recent order to make sure it reaches you as
            quickly as possible. We&apos;ll reach out right away if anything changes — thanks so
            much for your patience!
          </p>
        </div>
        <div className="mt-3 flex gap-2">
          <span className="inline-flex items-center rounded-md border border-border/60 bg-card px-2.5 py-1 text-xs text-muted-foreground">Edit</span>
          <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
            <Check className="size-3" /> Send &amp; resolve
          </span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>+ 23 more at-risk orders</span>
        <span className="inline-flex items-center gap-1 font-medium text-primary">
          <Zap className="size-3" /> Run auto-pilot
        </span>
      </div>
    </div>
  );
}
