import Link from "next/link";
import {
  Upload, Sparkles, ArrowRight, LayoutDashboard, Users, LineChart, MessagesSquare,
} from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { DataBadge } from "@/components/app/data-badge";
import { Card } from "@/components/ui/card";

const DEMO_LINKS = [
  { href: "/dashboard", label: "Risk dashboard", icon: LayoutDashboard },
  { href: "/segments", label: "Customer segments", icon: Users },
  { href: "/forecast", label: "Demand forecast", icon: LineChart },
  { href: "/copilot", label: "AI copilot", icon: MessagesSquare },
];

const ACTIONS = ["Expedite shipping", "Proactive support outreach", "Confirm the delivery ETA"];

export default function StartPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Start here"
        description="Veridian flags the orders that will go wrong — a late delivery or a 1–2★ review — before they do. The path is three steps: explore the demo, score your own orders, then act."
      />

      <div className="space-y-5">
        <Card>
          <div className="flex items-start gap-4">
            <StepNum n={1} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-semibold text-foreground">Explore the demo</h2>
                <DataBadge kind="demo" />
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                See the product working end-to-end on ~100k real Olist orders — a public
                sample, <strong className="font-medium text-foreground">not your data</strong>.
                Every figure on these pages comes from that dataset.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {DEMO_LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="group flex items-center gap-2 rounded-xl border border-border/70 bg-secondary/40 px-3 py-2.5 text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-secondary"
                  >
                    <l.icon className="size-4 text-primary" />
                    {l.label}
                    <ArrowRight className="ml-auto size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-4">
            <StepNum n={2} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-semibold text-foreground">Score your own orders</h2>
                <DataBadge kind="yours" />
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Export your orders from Shopify, Amazon Seller Central, or any platform as a
                CSV, then upload it. No API and no sign-up — the same calibrated models score
                every order, and nothing is stored.
              </p>
              <Link
                href="/connect"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow transition-opacity hover:opacity-90"
              >
                <Upload className="size-4" /> Connect your store
              </Link>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-4">
            <StepNum n={3} />
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-semibold text-foreground">Act on the risk</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Every at-risk order comes with a recommended next step — so a score turns into
                a save before the cost is locked in.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {ACTIONS.map((a) => (
                  <span
                    key={a}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-xs text-foreground"
                  >
                    <Sparkles className="size-3 text-primary" /> {a}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function StepNum({ n }: { n: number }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-display text-base font-bold text-primary">
      {n}
    </span>
  );
}
