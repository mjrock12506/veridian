"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "@/components/ui/card";
import type { DashboardData, ForecastData, SegmentsData } from "@/lib/api";

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

export function ValueTierChart({ data }: { data: SegmentsData["value_tiers"] }) {
  return (
    <ChartShell title="Revenue by spend tier" subtitle="Share of revenue across customer spend quartiles">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 32% 16%)" vertical={false} />
          <XAxis dataKey="tier" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} unit="%" />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: "hsl(220 30% 13% / 0.5)" }}
            formatter={(v: number) => [`${v}%`, "Revenue share"]}
          />
          <Bar dataKey="revenue_share_pct" name="Revenue share" fill={VIRIDIAN} radius={[4, 4, 0, 0]} maxBarSize={56} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

function ForecastTooltip({ active, payload, label }: {
  active?: boolean;
  label?: string;
  payload?: { dataKey: string; value: number | number[] }[];
}) {
  if (!active || !payload?.length) return null;
  const get = (k: string) => payload.find((p) => p.dataKey === k)?.value;
  const actual = get("actual") as number | undefined;
  const forecast = get("forecast") as number | undefined;
  const range = get("range") as number[] | undefined;
  return (
    <div style={tooltipStyle} className="px-3 py-2">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {actual != null ? (
        <p style={{ color: VIRIDIAN }}>Actual: {actual.toLocaleString()}</p>
      ) : forecast != null ? (
        <p style={{ color: AMBER }}>Forecast: {forecast.toLocaleString()}</p>
      ) : null}
      {Array.isArray(range) && (
        <p className="text-muted-foreground">
          Range: {Math.round(range[0]).toLocaleString()}–{Math.round(range[1]).toLocaleString()}
        </p>
      )}
    </div>
  );
}

export function ForecastChart({ data }: { data: ForecastData["series"] }) {
  // A range Area ([lower, upper]) draws the uncertainty band directly — no
  // stacking hack (which mis-rendered the overlaid lines). Actual and forecast
  // are separate lines; the bridge month carries both so they connect.
  const rows = data.map((d) => ({
    ...d,
    range: d.lower != null && d.upper != null ? [d.lower, d.upper] : null,
  }));
  const bridge = [...data].reverse().find((d) => d.actual != null)?.month;
  return (
    <ChartShell title="Order volume forecast" subtitle="Monthly orders — history and projection">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 32% 16%)" vertical={false} />
          <XAxis dataKey="month" tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={20} />
          <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip content={<ForecastTooltip />} />
          {bridge && (
            <ReferenceLine x={bridge} stroke="hsl(218 32% 30%)" strokeDasharray="3 3"
              label={{ value: "forecast →", position: "insideTopRight", fill: AXIS, fontSize: 10 }} />
          )}
          <Area dataKey="range" stroke="none" fill={AMBER} fillOpacity={0.12} isAnimationActive={false} legendType="none" connectNulls={false} />
          <Line dataKey="actual" name="Actual" stroke={VIRIDIAN} strokeWidth={2} dot={{ r: 2, fill: VIRIDIAN }} connectNulls={false} isAnimationActive={false} />
          <Line dataKey="forecast" name="Forecast" stroke={AMBER} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2, fill: AMBER }} connectNulls={false} isAnimationActive={false} />
          <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
        </ComposedChart>
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
