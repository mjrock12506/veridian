"use client";

import { Users, Repeat, Coins, Crown, ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { ValueTierChart } from "@/components/app/charts";
import { LoadingState, ErrorState } from "@/components/app/states";
import { Reveal } from "@/components/anim/reveal";
import { Card } from "@/components/ui/card";
import { api, type CustomerSegment, type SegmentsData } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { num, brl } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONE: Record<CustomerSegment["tone"], { dot: string; chip: string; accent: string }> = {
  primary: { dot: "bg-primary", chip: "border-primary/30 bg-primary/10 text-primary", accent: "border-primary/30 text-primary" },
  amber: { dot: "bg-amber-400", chip: "border-amber-400/30 bg-amber-400/10 text-amber-300", accent: "border-amber-400/30 text-amber-300" },
  muted: { dot: "bg-muted-foreground/60", chip: "border-border/60 bg-secondary/40 text-muted-foreground", accent: "border-border/60 text-muted-foreground" },
};

const prettyCategory = (c: string) => c.replace(/_/g, " ");

export default function SegmentsPage() {
  const { data, loading, error, reload } = useApi(() => api.segments());

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Customer segments"
        description="Every buyer grouped by lifetime value and loyalty, with a recommended retention action for each segment — computed from the full order history."
      />

      {loading && <LoadingState label="Segmenting customers…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Reveal index={0}>
              <StatCard icon={Users} label="Customers" value={num(data.summary.customers)}
                hint={`${num(data.summary.orders)} orders`} />
            </Reveal>
            <Reveal index={1}>
              <StatCard icon={Repeat} label="Repeat rate" value={`${data.summary.repeat_rate_pct}%`}
                hint="buyers with more than one order" />
            </Reveal>
            <Reveal index={2}>
              <StatCard icon={Coins} label="Avg order value" value={brl(data.summary.avg_order_value)}
                hint="across all orders" />
            </Reveal>
            <Reveal index={3}>
              <StatCard icon={Crown} label="VIP revenue share"
                value={`${data.value_tiers[data.value_tiers.length - 1]?.revenue_share_pct ?? 0}%`}
                hint="from the top spend quartile" />
            </Reveal>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {data.segments.map((s, i) => (
              <Reveal key={s.key} index={i} className="h-full">
                <SegmentCard s={s} />
              </Reveal>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Reveal index={0}>
              <ValueTierChart data={data.value_tiers} />
            </Reveal>
            <Reveal index={1}>
              <TopCategories data={data.top_categories} />
            </Reveal>
          </div>

          <Reveal>
            <TopStates data={data.top_states} />
          </Reveal>
        </div>
      )}
    </div>
  );
}

function SegmentCard({ s }: { s: CustomerSegment }) {
  const t = TONE[s.tone];
  return (
    <Card className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", t.dot)} />
          <div>
            <h3 className="font-display text-lg font-semibold text-foreground">{s.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
          </div>
        </div>
        <span className={cn("shrink-0 rounded-full border px-2.5 py-1 font-mono text-xs font-medium", t.chip)}>
          {s.share_pct}%
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Customers" value={num(s.customers)} />
        <Metric label="Avg spend" value={brl(s.avg_spend)} />
        <Metric label="Avg orders" value={s.avg_orders.toFixed(2)} />
        <Metric label="Revenue" value={`${s.revenue_share_pct}%`} />
      </div>

      <div className={cn("mt-auto flex items-center gap-2 rounded-xl border bg-secondary/30 px-3 py-2.5 text-sm", t.accent)}>
        <ArrowRight className="size-4 shrink-0" />
        <span className="text-foreground/90">{s.action}</span>
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}

function TopCategories({ data }: { data: SegmentsData["top_categories"] }) {
  const max = Math.max(...data.map((d) => d.revenue), 1);
  return (
    <Card className="flex flex-col">
      <div className="mb-4">
        <h3 className="font-display text-base font-semibold text-foreground">Top categories by revenue</h3>
        <p className="text-xs text-muted-foreground">Where revenue concentrates</p>
      </div>
      <ul className="space-y-3">
        {data.map((c) => (
          <li key={c.category}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="capitalize text-foreground/90">{prettyCategory(c.category)}</span>
              <span className="text-muted-foreground">{brl(c.revenue)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/50">
              <div className="h-full rounded-full bg-primary/70" style={{ width: `${(c.revenue / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TopStates({ data }: { data: SegmentsData["top_states"] }) {
  return (
    <Card>
      <div className="mb-4">
        <h3 className="font-display text-base font-semibold text-foreground">Customers by state</h3>
        <p className="text-xs text-muted-foreground">Top states by customer count, with average lifetime spend</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {data.map((s) => (
          <div key={s.state} className="rounded-xl border border-border/60 bg-secondary/30 p-3 text-center">
            <p className="font-display text-lg font-bold text-foreground">{s.state}</p>
            <p className="text-xs text-muted-foreground">{num(s.customers)}</p>
            <p className="mt-1 text-[0.7rem] text-muted-foreground/80">{brl(s.avg_spend)} avg</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
