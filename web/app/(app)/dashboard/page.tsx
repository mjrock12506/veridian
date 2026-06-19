"use client";

import { Package, AlertTriangle, ThumbsDown, ShieldAlert } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { OrdersTable } from "@/components/app/orders-table";
import { RiskDistributionChart, OrdersOverTimeChart } from "@/components/app/charts";
import { LoadingState, ErrorState } from "@/components/app/states";
import { Reveal } from "@/components/anim/reveal";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { num } from "@/lib/format";

export default function DashboardPage() {
  const { data, loading, error, reload } = useApi(() => api.dashboard());

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Risk dashboard"
        description="Every delivered order in the sample, scored for delivery-delay and low-review risk by the calibrated models."
      />

      {loading && <LoadingState label="Scoring orders…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Reveal index={0}>
              <StatCard icon={Package} label="Orders scored" value={num(data.summary.scored_sample)}
                hint={`of ${num(data.summary.delivered_orders)} delivered`} />
            </Reveal>
            <Reveal index={1}>
              <StatCard icon={AlertTriangle} label="Delay at-risk" value={`${data.summary.delay_at_risk_pct}%`}
                hint={`flagged above ${data.summary.delay_threshold}`} />
            </Reveal>
            <Reveal index={2}>
              <StatCard icon={ThumbsDown} label="Low-review at-risk" value={`${data.summary.low_review_at_risk_pct}%`}
                hint={`flagged above ${data.summary.low_review_threshold}`} />
            </Reveal>
            <Reveal index={3}>
              <StatCard icon={ShieldAlert} label="High-risk orders" value={num(data.summary.high_risk_orders)}
                hint="high on either model" />
            </Reveal>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Reveal index={0}>
              <RiskDistributionChart data={data.risk_distribution} />
            </Reveal>
            <Reveal index={1}>
              <OrdersOverTimeChart data={data.orders_over_time} />
            </Reveal>
          </div>

          <Reveal>
            <OrdersTable orders={data.orders} />
          </Reveal>
        </div>
      )}
    </div>
  );
}
