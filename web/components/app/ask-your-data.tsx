"use client";

import * as React from "react";
import { Sparkles, Send, Loader2, Database } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, type BatchScoreResult, type BatchScoreRow } from "@/lib/api";
import { pct, num } from "@/lib/format";

/*
  "Ask your data": after a user scores their own CSV, this summarises the scored
  orders into a compact context and lets the copilot answer questions grounded in
  THEIR data (passed via api.ask's data_context). The summary is built in the
  browser — the raw orders never leave the page, only an aggregate goes to /ask.
*/

function buildContext(d: BatchScoreResult, rows: Record<string, unknown>[]): string {
  const s = d.summary;
  const byId: Record<string, Record<string, unknown>> = {};
  for (const r of rows) byId[String(r.order_id ?? "")] = r;
  const maxRisk = (r: BatchScoreRow) => Math.max(r.delay_probability, r.low_review_probability);
  const top = [...d.results].sort((a, b) => maxRisk(b) - maxRisk(a)).slice(0, 8);

  const cat: Record<string, { n: number; risk: number }> = {};
  const state: Record<string, { n: number; risk: number }> = {};
  for (const r of d.results) {
    const row = byId[r.order_id] || {};
    const atRisk = r.delay_risk !== "low" || r.low_review_risk !== "low";
    const c = String(row.main_category ?? "unknown");
    const st = String(row.customer_state ?? "unknown");
    (cat[c] ??= { n: 0, risk: 0 }).n++; if (atRisk) cat[c].risk++;
    (state[st] ??= { n: 0, risk: 0 }).n++; if (atRisk) state[st].risk++;
  }
  const top5 = (m: Record<string, { n: number; risk: number }>) =>
    Object.entries(m).filter(([k]) => k !== "unknown").sort((a, b) => b[1].risk - a[1].risk).slice(0, 5);

  const lines = [
    "User's uploaded order book, scored just now by Veridian's calibrated models:",
    `- Orders scored: ${s.orders}`,
    `- Delay at-risk: ${s.delay_at_risk} (${s.delay_at_risk_pct}%)`,
    `- Low-review at-risk: ${s.low_review_at_risk} (${s.low_review_at_risk_pct}%)`,
    `- High risk on either model: ${s.high_risk}`,
    "",
    "Highest-risk orders:",
    ...top.map((r) => `- ${r.order_id}: delay ${pct(r.delay_probability)} (${r.delay_risk}), low-review ${pct(r.low_review_probability)} (${r.low_review_risk})`),
  ];
  const tc = top5(cat);
  if (tc.length) lines.push("", "At-risk by category (at-risk / total):", ...tc.map(([k, v]) => `- ${k}: ${v.risk}/${v.n}`));
  const ts = top5(state);
  if (ts.length) lines.push("", "At-risk by customer state (at-risk / total):", ...ts.map(([k, v]) => `- ${k}: ${v.risk}/${v.n}`));
  return lines.join("\n");
}

const SUGGESTIONS = [
  "Which of my orders are highest risk, and why?",
  "Summarize the risks in my order book.",
  "Which category or region should I prioritize?",
  "What should I do about my high-risk orders?",
];

type Msg = { role: "user" | "assistant"; text: string };

export function AskYourData({ data, rows }: { data: BatchScoreResult; rows: Record<string, unknown>[] }) {
  const context = React.useMemo(() => buildContext(data, rows), [data, rows]);
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setQ("");
    setBusy(true);
    try {
      const res = await api.ask(question, undefined, context);
      setMsgs((m) => [...m, { role: "assistant", text: res.answer }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: e instanceof Error ? e.message : "Sorry, I couldn't answer that." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <Database className="size-4 text-primary" />
        <h3 className="font-display text-base font-semibold text-foreground">Ask your data</h3>
        <span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-medium text-emerald-700">
          grounded in your {num(data.summary.orders)} orders
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        The copilot answers from <strong className="font-medium text-foreground">your</strong> scored orders — not the demo set.
      </p>

      {msgs.length > 0 && (
        <div className="mt-4 space-y-3">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex gap-2"}>
              {m.role === "assistant" && (
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Sparkles className="size-3.5" />
                </span>
              )}
              <div className={m.role === "user"
                ? "max-w-[85%] rounded-2xl bg-primary/10 px-3.5 py-2 text-sm text-foreground"
                : "max-w-[85%] rounded-2xl bg-secondary/50 px-3.5 py-2 text-sm leading-relaxed text-foreground"}>
                {m.text}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Reading your orders…
            </div>
          )}
        </div>
      )}

      {msgs.length === 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => ask(s)}
              className="rounded-full border border-border/70 bg-secondary/40 px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-primary/40 hover:text-foreground">
              {s}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="mt-4 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your orders…"
          className="h-11 flex-1 rounded-xl border border-border bg-secondary/40 px-3.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-ring/40" />
        <Button type="submit" disabled={busy || !q.trim()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
    </Card>
  );
}
