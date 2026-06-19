"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "@/components/ui/card";
import type { DashboardData } from "@/lib/api";

const VIRIDIAN = "#22dca9";
const AMBER = "#fbbf24";
const AXIS = "#64748b";

const tooltipStyle = {
  background: "hsl(220 42% 7%)",
  border: "1px solid hsl(218 32% 16%)",
  borderRadius: "0.75rem",
  fontSize: "0.8rem",
  color: "#e2e8f0",
};

function ChartShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col">
      <div className="mb-4">
        <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="h-64 w-full">{children}</div>
    </Card>
  );
}

export function RiskDistributionChart({ data }: { data: DashboardData["risk_distribution"] }) {
  return (
    <ChartShell title="Risk distribution" subtitle="Scored sample by predicted probability">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 32% 16%)" vertical={false} />
          <XAxis dataKey="bucket" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(220 30% 13% / 0.5)" }} />
          <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
          <Bar dataKey="delay" name="Delay" fill={VIRIDIAN} radius={[4, 4, 0, 0]} maxBarSize={36} />
          <Bar dataKey="low_review" name="Low review" fill={AMBER} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function OrdersOverTimeChart({ data }: { data: DashboardData["orders_over_time"] }) {
  return (
    <ChartShell title="Orders over time" subtitle="Monthly order volume across the dataset">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={VIRIDIAN} stopOpacity={0.5} />
              <stop offset="100%" stopColor={VIRIDIAN} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 32% 16%)" vertical={false} />
          <XAxis dataKey="month" tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: VIRIDIAN, strokeOpacity: 0.3 }} />
          <Area type="monotone" dataKey="orders" stroke={VIRIDIAN} strokeWidth={2} fill="url(#ordersFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
