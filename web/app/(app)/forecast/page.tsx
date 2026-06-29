"use client";

import { TrendingUp, CalendarClock, Activity, BarChart3, Info } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { DataBadge } from "@/components/app/data-badge";
import { StatCard } from "@/components/app/stat-card";
import { ForecastChart } from "@/components/app/charts";
import { LoadingState, ErrorState } from "@/components/app/states";
import { Reveal } from "@/components/anim/reveal";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { num } from "@/lib/format";

export default function ForecastPage() {
  const { data, loading, error, reload } = useApi(() => api.forecast());

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        badge={<DataBadge kind="demo" />}
        title="Demand forecast"
        description="Monthly order volume across the dataset, with a transparent trend-based projection for the months ahead."
      />

      {loading && <LoadingState label="Projecting demand…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Reveal index={0}>
              <StatCard icon={BarChart3} label="Latest month" value={num(data.summary.last_orders)}
                hint={`orders in ${data.summary.last_month}`} />
            </Reveal>
            <Reveal index={1}>
              <StatCard icon={CalendarClock} label="Projected next month" value={num(data.summary.next_orders)}
                hint={data.summary.next_month} />
            </Reveal>
            <Reveal index={2}>
              <StatCard icon={Activity} label="Avg MoM growth" value={`${data.summary.avg_mom_growth_pct}%`}
                hint="recent trailing window" />
            </Reveal>
            <Reveal index={3}>
              <StatCard icon={TrendingUp} label={`Next ${data.summary.horizon_months} months`}
                value={num(data.summary.projected_total)} hint="projected orders" />
            </Reveal>
          </div>

          <Reveal>
            <ForecastChart data={data.series} />
          </Reveal>

          <Reveal>
            <Card className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-secondary/40 text-muted-foreground">
                <Info className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">How this is computed</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {data.summary.method}. The shaded band is the ±1.96σ range from the fit
                  residuals. It is an illustrative baseline over historical Olist data
                  (2016–2018) — not a production forecasting model.
                </p>
              </div>
            </Card>
          </Reveal>
        </div>
      )}
    </div>
  );
}
