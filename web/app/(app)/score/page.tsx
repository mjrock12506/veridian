"use client";

import * as React from "react";
import { SlidersHorizontal, Zap, Loader2 } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { RiskBadge } from "@/components/app/risk-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, ApiError, type PredictionResponse } from "@/lib/api";
import { pct } from "@/lib/format";

const STATES = ["SP", "RJ", "MG", "RS", "PR", "SC", "BA", "DF", "GO", "ES", "PE", "CE", "PA", "AM"];
const PAYMENTS = ["credit_card", "boleto", "voucher", "debit_card"];
const CATEGORIES = [
  "bed_bath_table", "health_beauty", "sports_leisure", "furniture_decor",
  "computers_accessories", "housewares", "watches_gifts", "telephony", "auto", "toys",
];

const EXAMPLE: Record<string, string> = {
  estimated_delivery_days: "12",
  customer_seller_distance_km: "1800",
  total_price: "120",
  total_freight: "35",
  n_items: "1",
  max_installments: "3",
  customer_state: "AM",
  main_seller_state: "SP",
  main_category: "computers_accessories",
  primary_payment_type: "boleto",
  actual_delivery_days: "",
  delivery_vs_estimate_days: "",
};

type Results = { delay?: PredictionResponse; low_review?: PredictionResponse };

export default function ScorePage() {
  const [form, setForm] = React.useState<Record<string, string>>(EXAMPLE);
  const [results, setResults] = React.useState<Results | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function numericFields(keys: string[]) {
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      const v = form[k];
      if (v === undefined || v === "") continue;
      out[k] = isNaN(Number(v)) ? v : Number(v);
    }
    return out;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults(null);

    const orderTime = numericFields([
      "estimated_delivery_days", "customer_seller_distance_km", "total_price",
      "total_freight", "n_items", "max_installments", "customer_state",
      "main_seller_state", "main_category", "primary_payment_type",
    ]);
    const lowReview = { ...orderTime, ...numericFields(["actual_delivery_days", "delivery_vs_estimate_days"]) };
    if (form.delivery_vs_estimate_days !== "") {
      lowReview.is_late_int = Number(form.delivery_vs_estimate_days) > 0 ? 1 : 0;
    }

    try {
      const [delay, low_review] = await Promise.all([
        api.predictDelay(orderTime),
        api.predictLowReview(lowReview),
      ]);
      setResults({ delay, low_review });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Score an order"
        description="Enter an order's key fields and get the calibrated delay and low-review probabilities instantly. Anything you leave blank is imputed by the model."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <form onSubmit={onSubmit} className="space-y-6">
            <Fieldset title="Order">
              <NumberField label="Estimated delivery (days)" value={form.estimated_delivery_days} onChange={set("estimated_delivery_days")} />
              <NumberField label="Customer↔seller distance (km)" value={form.customer_seller_distance_km} onChange={set("customer_seller_distance_km")} />
              <NumberField label="Item total (BRL)" value={form.total_price} onChange={set("total_price")} />
              <NumberField label="Freight (BRL)" value={form.total_freight} onChange={set("total_freight")} />
              <NumberField label="Items" value={form.n_items} onChange={set("n_items")} />
              <NumberField label="Max installments" value={form.max_installments} onChange={set("max_installments")} />
              <SelectField label="Customer state" value={form.customer_state} onChange={set("customer_state")} options={STATES} />
              <SelectField label="Seller state" value={form.main_seller_state} onChange={set("main_seller_state")} options={STATES} />
              <SelectField label="Category" value={form.main_category} onChange={set("main_category")} options={CATEGORIES} />
              <SelectField label="Payment type" value={form.primary_payment_type} onChange={set("primary_payment_type")} options={PAYMENTS} />
            </Fieldset>

            <Fieldset title="Post-delivery (optional — improves the low-review estimate)">
              <NumberField label="Actual delivery (days)" value={form.actual_delivery_days} onChange={set("actual_delivery_days")} />
              <NumberField label="Delivered vs. estimate (days)" value={form.delivery_vs_estimate_days} onChange={set("delivery_vs_estimate_days")} />
            </Fieldset>

            <Button type="submit" size="lg" disabled={loading} className="w-full sm:w-auto">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
              Score order
            </Button>
          </form>
        </Card>

        <div className="space-y-4">
          {!results && !error && (
            <Card className="flex min-h-[16rem] flex-col items-center justify-center text-center text-muted-foreground">
              <SlidersHorizontal className="mb-3 size-7 text-primary/70" />
              <p className="text-sm">Results appear here once you score an order.</p>
            </Card>
          )}
          {error && (
            <Card className="border-rose-500/40 bg-rose-500/10 text-sm text-rose-700">{error}</Card>
          )}
          {results?.delay && <ResultCard title="Delivery delay risk" r={results.delay} />}
          {results?.low_review && <ResultCard title="Low-review risk" r={results.low_review} />}
        </div>
      </div>
    </div>
  );
}

function Fieldset({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground/70">{title}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background/60 px-3 text-sm text-foreground focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-muted-foreground">{label}</span>
      <input type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function ResultCard({ title, r }: { title: string; r: PredictionResponse }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-foreground">{title}</h3>
        <RiskBadge level={r.risk_level} />
      </div>
      <p className="font-display text-4xl font-bold tracking-tight text-foreground">{pct(r.probability)}</p>
      <p className="text-xs text-muted-foreground">
        Calibrated probability · {r.flag ? "above" : "below"} the alert threshold ({r.decision_threshold})
      </p>
    </Card>
  );
}
