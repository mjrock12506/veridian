"use client";

import Link from "next/link";
import { ArrowLeft, Clock, Star } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { RiskBadge } from "@/components/app/risk-badge";
import { LoadingState, ErrorState } from "@/components/app/states";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/anim/reveal";
import { api, type Driver, type OrderDetail, type RiskLevel } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { brl, num, pct } from "@/lib/format";

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const { data, loading, error, reload } = useApi(() => api.order(params.id), [params.id]);

  return (
    <div>
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to dashboard
      </Link>

      {loading && <LoadingState label="Loading order…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <div className="space-y-6">
          <PageHeader
            eyebrow="Order detail"
            title={`Order ${data.order_id.slice(0, 12)}…`}
            description={`${data.main_category ?? "Uncategorized"} · ${data.customer_state ?? "—"} · placed ${data.purchase_date ?? "—"}`}
          />

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Fact label="Order value" value={brl(data.total_price)} />
            <Fact label="Items" value={num(data.n_items)} />
            <Fact label="Est. delivery" value={data.estimated_delivery_days != null ? `${num(data.estimated_delivery_days)} d` : "—"} icon={<Clock className="size-3.5" />} />
            <Fact label="Review score" value={data.review_score != null ? `${data.review_score}★` : "—"} icon={<Star className="size-3.5" />} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Reveal index={0}>
              <RiskPanel
                title="Delivery delay risk"
                probability={data.delay_probability}
                level={data.delay_risk}
                flag={data.delay_flag}
                drivers={data.drivers.delay}
                driversLabel="Top model drivers (SHAP)"
              />
            </Reveal>
            <Reveal index={1}>
              <RiskPanel
                title="Low-review risk"
                probability={data.low_review_probability}
                level={data.low_review_risk}
                flag={data.low_review_flag}
                drivers={data.drivers.low_review}
                driversLabel="Key features"
              />
            </Reveal>
          </div>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</span>
      <p className="mt-1 font-display text-xl font-semibold text-foreground">{value}</p>
    </Card>
  );
}

function RiskPanel({
  title,
  probability,
  level,
  flag,
  drivers,
  driversLabel,
}: {
  title: string;
  probability: number;
  level: RiskLevel;
  flag: boolean;
  drivers: Driver[];
  driversLabel: string;
}) {
  const maxImp = Math.max(...drivers.map((d) => d.importance ?? 0), 1e-6);
  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
        <RiskBadge level={level} />
      </div>
      <div className="mt-4 flex items-end gap-3">
        <span className="font-display text-5xl font-bold tracking-tight text-foreground">{pct(probability)}</span>
        <span className="mb-1.5 text-xs text-muted-foreground">
          calibrated probability · {flag ? "above" : "below"} alert threshold
        </span>
      </div>

      <div className="mt-6 border-t border-border/60 pt-4">
        <p className="mb-3 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground/70">
          {driversLabel}
        </p>
        <ul className="space-y-2.5">
          {drivers.map((d) => (
            <li key={d.feature} className="text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs text-foreground/90">{d.feature}</span>
                <span className="tabular-nums text-xs text-muted-foreground">
                  {d.value === null || d.value === undefined ? "—" : String(d.value)}
                </span>
              </div>
              {d.importance != null && (
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${Math.max((d.importance / maxImp) * 100, 4)}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
