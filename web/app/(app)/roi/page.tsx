"use client";

import * as React from "react";
import { Star, Truck, DollarSign, Sparkles, Wand2 } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { DataBadge } from "@/components/app/data-badge";
import { StatCard } from "@/components/app/stat-card";
import { Card } from "@/components/ui/card";
import { LoadingState, ErrorState } from "@/components/app/states";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { num } from "@/lib/format";

const money = (n: number) => "$" + Math.round(n).toLocaleString();

export default function RoiPage() {
  const { data, loading, error, reload } = useApi(() => api.dashboard());
  const [aov, setAov] = React.useState(160);
  const [success, setSuccess] = React.useState(35); // % of at-risk orders an intervention saves
  const [ordersLost, setOrdersLost] = React.useState(15); // tenths: 1.5 future orders lost per bad review
  const [delayCost, setDelayCost] = React.useState(18); // $ saved per late delivery caught early

  // Seed the average order value from the scored sample once it loads.
  React.useEffect(() => {
    if (!data) return;
    const prices = data.orders.map((o) => o.total_price).filter((p): p is number => typeof p === "number" && p > 0);
    if (prices.length) setAov(Math.round(prices.reduce((a, b) => a + b, 0) / prices.length));
  }, [data]);

  const m = React.useMemo(() => {
    if (!data) return null;
    const total = data.summary.total_orders;
    const sample = data.orders.length || 1;
    const scale = total / sample;
    const delayAtRisk = Math.round(data.orders.filter((o) => o.delay_risk !== "low").length * scale);
    const reviewAtRisk = Math.round(data.orders.filter((o) => o.low_review_risk !== "low").length * scale);
    const sr = success / 100;
    const reviewsPrevented = Math.round(reviewAtRisk * sr);
    const delaysCaught = Math.round(delayAtRisk * sr);
    const lostPerReview = ordersLost / 10;
    const reviewDollars = reviewsPrevented * aov * lostPerReview;
    const delayDollars = delaysCaught * delayCost;
    return {
      total, delayAtRisk, reviewAtRisk, reviewsPrevented, delaysCaught, lostPerReview,
      reviewDollars, delayDollars, dollars: reviewDollars + delayDollars,
    };
  }, [data, aov, success, ordersLost, delayCost]);

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        badge={<DataBadge kind="demo" />}
        title="Impact & ROI"
        description="What acting on these risks is worth. Veridian flags the at-risk orders; a proactive save prevents a refund, a bad review, and the churn that follows. Tune the assumptions to your business — the numbers update live."
      />

      {loading && <LoadingState label="Modeling impact…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && m && (
        <div className="space-y-6">
          {/* Headline impact */}
          <Card className="bg-gradient-to-br from-primary/[0.07] to-transparent">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <DollarSign className="size-4" /> Revenue protected across your order book
            </div>
            <div className="mt-2 font-display text-4xl font-bold tabular-nums text-foreground sm:text-5xl">
              {money(m.dollars)}
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Across {num(m.total)} scored orders, acting on the at-risk ones at a {success}% success rate
              prevents <strong className="font-medium text-foreground">{num(m.reviewsPrevented)} bad reviews</strong> and
              catches <strong className="font-medium text-foreground">{num(m.delaysCaught)} late deliveries</strong> early.
            </p>
          </Card>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={Star} label="Bad reviews prevented" value={num(m.reviewsPrevented)} hint={`of ~${num(m.reviewAtRisk)} at-risk`} />
            <StatCard icon={Truck} label="Late deliveries caught" value={num(m.delaysCaught)} hint={`of ~${num(m.delayAtRisk)} at-risk`} />
            <StatCard icon={DollarSign} label="From reviews" value={money(m.reviewDollars)} hint="retained revenue" />
            <StatCard icon={DollarSign} label="From delays" value={money(m.delayDollars)} hint="cost avoided" />
          </div>

          {/* Assumptions */}
          <Card>
            <div className="flex items-center gap-2">
              <Wand2 className="size-4 text-primary" />
              <h3 className="font-display text-base font-semibold text-foreground">Your assumptions</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Adjust to match your business — everything recalculates instantly.</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Slider label="Average order value" value={aov} set={setAov} min={20} max={500} step={5} fmt={(v) => money(v)} />
              <Slider label="Intervention success rate" value={success} set={setSuccess} min={5} max={80} step={5} fmt={(v) => `${v}%`} />
              <Slider label="Future orders lost per bad review" value={ordersLost} set={setOrdersLost} min={0} max={40} step={1} fmt={(v) => (v / 10).toFixed(1)} />
              <Slider label="Cost avoided per late delivery caught" value={delayCost} set={setDelayCost} min={0} max={60} step={1} fmt={(v) => money(v)} />
            </div>
          </Card>

          {/* Transparent math */}
          <Card className="bg-secondary/30">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h3 className="font-display text-sm font-semibold text-foreground">How this is calculated</h3>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li>• ~{num(m.reviewAtRisk)} orders at low-review risk × {success}% saved = <span className="text-foreground">{num(m.reviewsPrevented)} reviews prevented</span> × {money(aov)} × {m.lostPerReview.toFixed(1)} orders lost = <span className="font-medium text-foreground">{money(m.reviewDollars)}</span></li>
              <li>• ~{num(m.delayAtRisk)} orders at delay risk × {success}% caught = <span className="text-foreground">{num(m.delaysCaught)} deliveries</span> × {money(delayCost)} saved = <span className="font-medium text-foreground">{money(m.delayDollars)}</span></li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Illustrative estimate on the Olist demo data. Connect your store to run it on your own orders.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}

function Slider({ label, value, set, min, max, step, fmt }: {
  label: string; value: number; set: (n: number) => void; min: number; max: number; step: number; fmt: (v: number) => string;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="font-display text-sm font-semibold tabular-nums text-foreground">{fmt(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-[hsl(var(--primary))]"
      />
    </label>
  );
}
