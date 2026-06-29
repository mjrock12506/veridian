"use client";

import * as React from "react";
import { Zap, FileUp, Sparkles, Download, Package, AlertTriangle, ThumbsDown, ShieldAlert, Loader2 } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { RiskBadge } from "@/components/app/risk-badge";
import { DataBadge } from "@/components/app/data-badge";
import { RequireAuth } from "@/components/auth/require-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, type BatchScoreResult, type BatchScoreRow } from "@/lib/api";
import { pct, num } from "@/lib/format";

// A plain-English next step per scored order, so the score leads to an action.
function recommendedAction(r: BatchScoreRow): string {
  if (r.delay_risk === "high") return "Expedite shipping";
  if (r.low_review_risk === "high") return "Proactive support outreach";
  if (r.delay_risk === "medium") return "Confirm the delivery ETA";
  if (r.low_review_risk === "medium") return "Check in after delivery";
  return "No action needed";
}

function downloadTemplate() {
  const blob = new Blob([SAMPLE_CSV + "\n"], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "veridian-orders-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Order-time columns a store knows when the order is placed. Everything is
// optional — the models impute anything you leave out.
const SAMPLE_CSV = `order_id,total_price,n_items,estimated_delivery_days,customer_seller_distance_km,customer_state,main_seller_state,main_category,primary_payment_type
ORD-1001,150,1,15,300,SP,SP,health_beauty,credit_card
ORD-1002,200,1,3,3500,AM,SP,computers_accessories,boleto
ORD-1003,89,2,8,400,RJ,RJ,bed_bath_table,credit_card
ORD-1004,45,1,5,3200,AP,RS,toys,boleto
ORD-1005,540,2,30,2600,CE,SP,furniture_decor,credit_card
ORD-1006,310,3,1,2800,RR,SP,watches_gifts,boleto`;

function splitRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitRow(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitRow(line);
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      const raw = (cells[i] ?? "").trim();
      if (raw === "") return;
      const n = Number(raw);
      obj[h] = h === "order_id" || h === "id" || raw === "" || Number.isNaN(n) ? raw : n;
    });
    return obj;
  });
}

export default function ConnectPage() {
  const [text, setText] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<BatchScoreResult | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function score(csv: string) {
    const orders = parseCsv(csv);
    if (!orders.length) {
      setError("No rows found. Paste a CSV with a header row, or load the sample.");
      return;
    }
    setError(null);
    setLoading(true);
    setData(null);
    try {
      setData(await api.scoreBatch(orders));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scoring failed.");
    } finally {
      setLoading(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const t = String(reader.result);
      setText(t);
      void score(t);
    };
    reader.readAsText(f);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Connect your store"
        description="Export your orders from Shopify, Amazon Seller Central, or any platform as a CSV, then upload it here. Scoring your own orders needs a free account — your data is processed in your browser, never stored, and never shared."
      />

      <RequireAuth next="/connect">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        <Card className="flex flex-col gap-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder={"order_id,total_price,estimated_delivery_days,customer_state,…\nORD-1,150,15,SP,…"}
            className="h-56 w-full resize-none rounded-xl border border-border bg-card/60 p-3 font-mono text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => score(text)} disabled={loading} size="lg">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
              Score orders
            </Button>
            <Button variant="secondary" onClick={() => { setText(SAMPLE_CSV); void score(SAMPLE_CSV); }} disabled={loading}>
              <Sparkles className="size-4" /> Load sample
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={loading}>
              <FileUp className="size-4" /> Upload .csv
            </Button>
            <Button variant="secondary" onClick={downloadTemplate}>
              <Download className="size-4" /> Template
            </Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            First row is a header. Recognised columns include{" "}
            <code className="rounded bg-secondary/60 px-1 py-0.5 text-[0.7rem]">order_id</code>,{" "}
            <code className="rounded bg-secondary/60 px-1 py-0.5 text-[0.7rem]">total_price</code>,{" "}
            <code className="rounded bg-secondary/60 px-1 py-0.5 text-[0.7rem]">estimated_delivery_days</code>,{" "}
            <code className="rounded bg-secondary/60 px-1 py-0.5 text-[0.7rem]">customer_seller_distance_km</code>,{" "}
            <code className="rounded bg-secondary/60 px-1 py-0.5 text-[0.7rem]">customer_state</code>,{" "}
            <code className="rounded bg-secondary/60 px-1 py-0.5 text-[0.7rem]">main_category</code>. Anything else is ignored.
          </p>
        </Card>

        <div className="min-w-0">
          {error && (
            <Card className="border-rose-500/40 bg-rose-500/10 text-sm text-rose-700">{error}</Card>
          )}
          {!error && !data && !loading && (
            <Card className="flex h-full min-h-[18rem] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <span className="flex size-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
                <Package className="size-6" />
              </span>
              <p className="max-w-xs text-sm">Paste or upload your orders, or load the sample, to see a calibrated risk for every one.</p>
            </Card>
          )}
          {loading && (
            <Card className="flex h-full min-h-[18rem] items-center justify-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin text-primary" /> Scoring orders…
            </Card>
          )}
          {data && !loading && <Results data={data} />}
        </div>
      </div>
      </RequireAuth>
    </div>
  );
}

function Results({ data }: { data: BatchScoreResult }) {
  const s = data.summary;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-foreground">Results</h2>
        <DataBadge kind="yours" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Package} label="Scored" value={num(s.orders)} hint="your orders" />
        <StatCard icon={AlertTriangle} label="Delay at-risk" value={`${s.delay_at_risk_pct}%`} hint={`${num(s.delay_at_risk)} flagged`} />
        <StatCard icon={ThumbsDown} label="Low-review at-risk" value={`${s.low_review_at_risk_pct}%`} hint={`${num(s.low_review_at_risk)} flagged`} />
        <StatCard icon={ShieldAlert} label="High risk" value={num(s.high_risk)} hint="on either model" />
      </div>
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">Order</th>
                <th className="px-5 py-3 font-medium">Delay risk</th>
                <th className="px-5 py-3 font-medium">Low-review risk</th>
                <th className="px-5 py-3 font-medium">Recommended action</th>
              </tr>
            </thead>
            <tbody>
              {[...data.results]
                .sort((a, b) => Math.max(b.delay_probability, b.low_review_probability) - Math.max(a.delay_probability, a.low_review_probability))
                .map((r) => {
                  const action = recommendedAction(r);
                  const actionable = action !== "No action needed";
                  return (
                    <tr key={r.order_id} className="border-b border-border/40 last:border-0 hover:bg-secondary/40">
                      <td className="px-5 py-3 font-mono text-xs text-foreground/90">{r.order_id}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums text-foreground">{pct(r.delay_probability)}</span>
                          <RiskBadge level={r.delay_risk} />
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums text-foreground">{pct(r.low_review_probability)}</span>
                          <RiskBadge level={r.low_review_risk} />
                        </div>
                      </td>
                      <td className={`px-5 py-3 ${actionable ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                        {action}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
