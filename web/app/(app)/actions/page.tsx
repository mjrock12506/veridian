"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Sparkles, Send, Check, Loader2, Zap, Inbox, ShieldCheck, Flame, Mail,
  Search, ListChecks, PencilLine, Share2, CheckCircle2, Download, ChevronRight,
  Radio, AlertCircle,
} from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { RiskBadge } from "@/components/app/risk-badge";
import { AgentRun } from "@/components/app/agent-run";
import { LoadingState, ErrorState } from "@/components/app/states";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, type ScoredOrder, type DraftMessageResult } from "@/lib/api";
import { DESTINATIONS, destination, routeFor } from "@/lib/connectors";
import { priorityOf, playbook, composeMessage, rank } from "@/lib/playbook";
import { useLiveMode, type LiveMode } from "@/lib/live-mode";
import { useApi } from "@/lib/use-api";
import { num, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

type Delivery = "live" | "sim" | "failed";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_QUEUE = 24;

const PIPELINE = [
  { icon: Search, label: "Scan & score", sub: "every order" },
  { icon: ListChecks, label: "Prioritize", sub: "High first" },
  { icon: PencilLine, label: "Draft outreach", sub: "per order" },
  { icon: Share2, label: "Route to your tools", sub: "email · Slack · CRM" },
  { icon: CheckCircle2, label: "Resolve & log", sub: "you approve" },
];

export default function ActionsPage() {
  const { data, loading, error, reload } = useApi(() => api.dashboard());
  const live = useLiveMode();
  const [resolved, setResolved] = React.useState<Record<string, string>>({});
  const [delivered, setDelivered] = React.useState<Record<string, Delivery>>({});
  const [drafts, setDrafts] = React.useState<Record<string, DraftMessageResult>>({});
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [autopilot, setAutopilot] = React.useState(false);
  const [showRun, setShowRun] = React.useState(false);
  const [rules, setRules] = React.useState({ autoDelay: true, escalate: true, digest: false });

  const atRisk = React.useMemo(
    () => (data ? data.orders.filter((o) => priorityOf(o)).sort((a, b) => rank(b) - rank(a)).slice(0, MAX_QUEUE) : []),
    [data]
  );
  const queue = atRisk.filter((o) => !resolved[o.order_id]);
  const resolvedList = atRisk.filter((o) => resolved[o.order_id]);
  const highOpen = queue.filter((o) => priorityOf(o) === "high");
  const coverage = atRisk.length ? Math.round((resolvedList.length / atRisk.length) * 100) : 0;
  const selInQueue = queue.filter((o) => selected.has(o.order_id));

  function draftFor(o: ScoredOrder) {
    setDrafts((d) => ({ ...d, [o.order_id]: { message: composeMessage(o), source: "ai" } }));
  }
  function payloadFor(o: ScoredOrder) {
    return {
      source: "Veridian",
      text: `⚠️ Veridian — Order #${o.order_id.slice(0, 8)} (${priorityOf(o)}) · delay ${pct(o.delay_probability)} / review ${pct(o.low_review_probability)}. Action: ${playbook(o)}.`,
      order_id: o.order_id, delay_risk: o.delay_risk, low_review_risk: o.low_review_risk,
      delay_probability: o.delay_probability, low_review_probability: o.low_review_probability,
      recommended_action: playbook(o), message: drafts[o.order_id]?.message ?? composeMessage(o),
    };
  }
  async function deliverOne(o: ScoredOrder): Promise<Delivery> {
    if (!live.isLive) return "sim";
    try { const r = await api.dispatchWebhook(live.webhook, payloadFor(o)); return r.ok ? "live" : "failed"; }
    catch { return "failed"; }
  }
  async function deliverSummary(orders: ScoredOrder[]): Promise<Delivery> {
    if (!live.isLive || !orders.length) return "sim";
    const ids = orders.map((o) => "#" + o.order_id.slice(0, 8));
    try {
      const r = await api.dispatchWebhook(live.webhook, {
        source: "Veridian",
        text: `✅ Veridian — ${orders.length} at-risk orders actioned: ${ids.slice(0, 8).join(", ")}${ids.length > 8 ? ` +${ids.length - 8} more` : ""}`,
        count: orders.length, order_ids: orders.map((o) => o.order_id),
      });
      return r.ok ? "live" : "failed";
    } catch { return "failed"; }
  }

  async function resolveOne(o: ScoredOrder) {
    setResolved((r) => ({ ...r, [o.order_id]: playbook(o) }));
    setSelected((s) => { const n = new Set(s); n.delete(o.order_id); return n; });
    const d = await deliverOne(o);
    setDelivered((m) => ({ ...m, [o.order_id]: d }));
  }
  const editDraft = (id: string, text: string) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], message: text } }));
  const toggleSel = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function resolveMany(orders: ScoredOrder[]) {
    setResolved((r) => {
      const n = { ...r };
      for (const o of orders) n[o.order_id] = playbook(o);
      return n;
    });
    setSelected(new Set());
    const d = await deliverSummary(orders);
    setDelivered((m) => { const n = { ...m }; for (const o of orders) n[o.order_id] = d; return n; });
  }

  async function runAutopilot() {
    setAutopilot(true);
    const worked = [...queue];
    for (const o of queue) {
      await sleep(220);
      setResolved((r) => ({ ...r, [o.order_id]: playbook(o) }));
    }
    const d = await deliverSummary(worked);
    setDelivered((m) => { const n = { ...m }; for (const o of worked) n[o.order_id] = d; return n; });
    setAutopilot(false);
  }

  function exportCsv() {
    const rows = [
      ["order_id", "priority", "delay_risk", "delay_prob", "low_review_risk", "low_review_prob", "state", "category", "recommended_action", "routes_to"],
      ...queue.map((o) => [
        o.order_id, priorityOf(o) ?? "", o.delay_risk, o.delay_probability.toFixed(3),
        o.low_review_risk, o.low_review_probability.toFixed(3), o.customer_state ?? "",
        o.main_category ?? "", playbook(o), routeFor(o).map((id) => destination(id).name).join(" | "),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "veridian-action-queue.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // Funnel: scanned -> flagged at-risk -> queued for you now. The dashboard scores
  // a sample, so extrapolate the at-risk rate to the full book for an honest,
  // monotonically-narrowing story (never fewer "flagged" than are "queued").
  const scanned = data?.summary.total_orders ?? 0;
  const sampleSize = data?.orders.length || 1;
  const atRiskInSample = data ? data.orders.filter((o) => priorityOf(o)).length : 0;
  const flagged = Math.max(queue.length, Math.round((atRiskInSample / sampleSize) * scanned));

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        badge={<ModeBadge live={live} />}
        title="AI action center"
        description="The AI scans every order, triages the at-risk ones by priority, drafts the outreach, and routes each action to your tools — so a small team clears thousands of orders with a few clicks. You approve; nothing sends on its own."
        actions={
          queue.length > 0 ? (
            <Button onClick={runAutopilot} disabled={autopilot} size="lg">
              {autopilot ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
              {autopilot ? "Auto-pilot working…" : "Run AI auto-pilot"}
            </Button>
          ) : undefined
        }
      />

      {loading && <LoadingState label="Triaging orders…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <div className="space-y-6">
          <ModeBanner live={live} />

          {/* Scale funnel — the AI narrows the haystack to the orders worth a human's time */}
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Funnel n={num(scanned)} label="orders scanned" tone="muted" />
              <ChevronRight className="hidden size-5 shrink-0 text-muted-foreground/40 sm:block" />
              <Funnel n={num(flagged)} label="flagged at-risk" tone="amber" />
              <ChevronRight className="hidden size-5 shrink-0 text-muted-foreground/40 sm:block" />
              <Funnel n={num(queue.length)} label="drafted & ready for you" tone="primary" />
            </div>
          </Card>

          {/* Agentic pipeline strip */}
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Bot className="size-4 text-primary" />
              <h3 className="font-display text-sm font-semibold text-foreground">How the AI works each order</h3>
            </div>
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {PIPELINE.map((s, i) => (
                <li key={s.label} className="relative flex items-center gap-2.5 rounded-xl border border-border/60 bg-secondary/30 px-3 py-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <s.icon className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-foreground">{s.label}</span>
                    <span className="block truncate text-[0.7rem] text-muted-foreground">{s.sub}</span>
                  </span>
                  {i < PIPELINE.length - 1 && (
                    <ChevronRight className="absolute -right-[11px] top-1/2 z-10 hidden size-4 -translate-y-1/2 text-muted-foreground/30 lg:block" />
                  )}
                </li>
              ))}
            </ol>
            <button
              onClick={() => setShowRun((v) => !v)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            >
              {showRun ? <ChevronRight className="size-3.5 rotate-90" /> : <ChevronRight className="size-3.5" />}
              {showRun ? "Hide the live agent run" : "Watch the agents work one order"}
            </button>
            <AnimatePresence>
              {showRun && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-4 border-t border-border/50 pt-4">
                    <AgentRun queue={atRisk} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={Inbox} label="Needs action" value={num(queue.length)} hint="at-risk, open" />
            <StatCard icon={Flame} label="High priority" value={num(highOpen.length)} hint="open & high risk" />
            <StatCard icon={ShieldCheck} label="Resolved" value={num(resolvedList.length)} hint="actioned by you / AI" />
            <StatCard icon={Bot} label="Coverage" value={`${coverage}%`} hint="of at-risk handled" />
          </div>

          {/* Connected destinations — where actions land */}
          <Card>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Share2 className="size-4 text-primary" /> Actions route to
              </span>
              {DESTINATIONS.map((d) => (
                <span key={d.id} className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs text-foreground/80">
                  <d.icon className={cn("size-3.5", d.color)} /> {d.name}
                  <span className="size-1.5 rounded-full bg-emerald-500" title="Connected (demo)" />
                </span>
              ))}
              <span className="ml-auto text-xs text-muted-foreground">Preview · routing is simulated, not sent to live tools yet</span>
            </div>
          </Card>

          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <div className="text-sm">
              <p className="font-medium text-foreground">You&apos;re always in control</p>
              <p className="mt-0.5 leading-relaxed text-muted-foreground">
                Veridian <strong className="font-medium text-foreground">drafts</strong> messages and{" "}
                <strong className="font-medium text-foreground">recommends</strong> actions — you approve in bulk or one at a time.
                Nothing reaches a customer automatically, and contact details stay in your own connected systems.
              </p>
            </div>
          </div>

          {/* Bulk action bar — the scale story: clear the queue without touching each order */}
          {queue.length > 0 && (
            <div className="sticky top-3 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card/95 p-3 shadow-card backdrop-blur">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground">
                <input type="checkbox"
                  checked={selInQueue.length === queue.length && queue.length > 0}
                  ref={(el) => { if (el) el.indeterminate = selInQueue.length > 0 && selInQueue.length < queue.length; }}
                  onChange={(e) => setSelected(e.target.checked ? new Set(queue.map((o) => o.order_id)) : new Set())}
                  className="size-4 accent-[hsl(var(--primary))]" />
                Select all
              </label>
              {selInQueue.length > 0 ? (
                <Button size="sm" onClick={() => resolveMany(selInQueue)}>
                  <Send className="size-3.5" /> Approve &amp; send {selInQueue.length} selected
                </Button>
              ) : (
                <Button size="sm" disabled={highOpen.length === 0} onClick={() => resolveMany(highOpen)}>
                  <Flame className="size-3.5" /> Approve &amp; send all High ({highOpen.length})
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => resolveMany(queue)}>
                <Check className="size-3.5" /> Resolve all ({queue.length})
              </Button>
              <Button size="sm" variant="ghost" onClick={exportCsv} className="ml-auto">
                <Download className="size-3.5" /> Export queue
              </Button>
            </div>
          )}

          <div>
            <h3 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-foreground">
              Priority queue
              <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-xs text-muted-foreground">{queue.length}</span>
            </h3>
            {queue.length === 0 ? (
              <Card className="flex items-center gap-3 text-sm text-muted-foreground">
                <ShieldCheck className="size-5 text-emerald-600" /> Queue clear — every at-risk order has an action applied and routed.
              </Card>
            ) : (
              <motion.ul layout className="space-y-3">
                <AnimatePresence initial={false}>
                  {queue.map((o) => (
                    <motion.li
                      key={o.order_id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.97, height: 0, marginTop: 0 }}
                      transition={{ duration: 0.22 }}
                    >
                      <OrderCard
                        o={o}
                        draft={drafts[o.order_id]}
                        selected={selected.has(o.order_id)}
                        onSelect={() => toggleSel(o.order_id)}
                        onDraft={() => draftFor(o)}
                        onResolve={() => resolveOne(o)}
                        onEdit={(t) => editDraft(o.order_id, t)}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
            )}
          </div>

          <Card>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h3 className="font-display text-base font-semibold text-foreground">Automation rules</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              When connected to your live orders, these draft and queue actions for your review — they never auto-send.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Toggle on={rules.autoDelay} onClick={() => setRules((r) => ({ ...r, autoDelay: !r.autoDelay }))}
                label="Auto-draft message on High delay" />
              <Toggle on={rules.escalate} onClick={() => setRules((r) => ({ ...r, escalate: !r.escalate }))}
                label="Escalate High low-review to support" />
              <Toggle on={rules.digest} onClick={() => setRules((r) => ({ ...r, digest: !r.digest }))}
                label="Daily 9am risk digest to Slack" />
            </div>
          </Card>

          {resolvedList.length > 0 && (
            <div>
              <h3 className="mb-3 font-display text-base font-semibold text-foreground">Resolved &amp; routed</h3>
              <Card className="divide-y divide-border/50 p-0">
                {resolvedList.map((o) => (
                  <div key={o.order_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
                    <Check className="size-4 shrink-0 text-emerald-600" />
                    <span className="font-mono text-xs text-foreground/80">{o.order_id.slice(0, 10)}…</span>
                    <span className="text-muted-foreground">{resolved[o.order_id]}</span>
                    <DeliveryTag status={delivered[o.order_id]} />
                    <span className="ml-auto flex items-center gap-1">
                      {routeFor(o).map((id) => {
                        const d = destination(id);
                        return <d.icon key={id} className={cn("size-3.5", d.color)} aria-label={d.name} />;
                      })}
                    </span>
                  </div>
                ))}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ModeBadge({ live }: { live: LiveMode }) {
  if (live.isLive)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wide text-emerald-700">
        <Radio className="size-3" /> Live · delivering
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wide text-amber-700">
      Demo · simulated
    </span>
  );
}

function ModeBanner({ live }: { live: LiveMode }) {
  if (live.isLive)
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
        <Radio className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        <p className="leading-relaxed text-muted-foreground">
          <strong className="font-medium text-foreground">Live mode.</strong> Resolving an order — or a bulk approve — now
          delivers a real action to your connected webhook. This is no longer a simulation.
        </p>
      </div>
    );
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
      <AlertCircle className="size-5 shrink-0 text-amber-600" />
      <p className="leading-relaxed text-muted-foreground">
        <strong className="font-medium text-foreground">Demo mode — actions are simulated.</strong>{" "}
        {live.signedIn
          ? "You're signed in. Connect a delivery webhook to make actions real."
          : "Sign in and connect a tool to switch on real delivery."}
      </p>
      <Link href="/connections" className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90">
        <Radio className="size-3.5" /> {live.signedIn ? "Connect a tool" : "Set up live delivery"}
      </Link>
    </div>
  );
}

function DeliveryTag({ status }: { status?: Delivery }) {
  if (!status) return null;
  if (status === "live")
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase text-emerald-700"><Radio className="size-2.5" /> delivered</span>;
  if (status === "failed")
    return <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase text-rose-700"><AlertCircle className="size-2.5" /> failed</span>;
  return <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[0.6rem] font-medium uppercase text-muted-foreground">simulated</span>;
}

function Funnel({ n, label, tone }: { n: string; label: string; tone: "muted" | "amber" | "primary" }) {
  const color = tone === "primary" ? "text-primary" : tone === "amber" ? "text-amber-600" : "text-foreground";
  return (
    <div className="flex-1">
      <div className={cn("font-display text-2xl font-bold tabular-nums sm:text-3xl", color)}>{n}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function OrderCard({
  o, draft, selected, onSelect, onDraft, onResolve, onEdit,
}: {
  o: ScoredOrder;
  draft?: DraftMessageResult;
  selected: boolean;
  onSelect: () => void;
  onDraft: () => void;
  onResolve: () => void;
  onEdit: (text: string) => void;
}) {
  const isHigh = priorityOf(o) === "high";
  const routes = routeFor(o);
  return (
    <Card className={cn("flex flex-col gap-3 transition-colors", selected && "border-primary/40 bg-primary/[0.03]")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <input type="checkbox" checked={selected} onChange={onSelect}
            className="mt-1 size-4 shrink-0 accent-[hsl(var(--primary))]" aria-label="Select order" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wide",
                isHigh ? "bg-rose-500/10 text-rose-700" : "bg-amber-500/10 text-amber-700")}>
                {isHigh ? "High priority" : "Medium"}
              </span>
              <span className="font-mono text-xs text-foreground/80">{o.order_id.slice(0, 12)}…</span>
              <span className="text-xs text-muted-foreground">{o.customer_state ?? "—"} · {o.main_category ?? "—"}</span>
            </div>
            <p className="mt-2 text-sm font-medium text-foreground">{playbook(o)}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-muted-foreground">
              <span>Routes to</span>
              {routes.map((id) => {
                const d = destination(id);
                return (
                  <span key={id} className="inline-flex items-center gap-1 rounded-md bg-secondary/60 px-1.5 py-0.5">
                    <d.icon className={cn("size-3", d.color)} /> {d.name.split(" / ")[0]}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 text-xs">
          <span className="flex items-center gap-1.5"><span className="tabular-nums text-muted-foreground">{pct(o.delay_probability)}</span><RiskBadge level={o.delay_risk} label="delay" /></span>
          <span className="flex items-center gap-1.5"><span className="tabular-nums text-muted-foreground">{pct(o.low_review_probability)}</span><RiskBadge level={o.low_review_risk} label="review" /></span>
        </div>
      </div>

      {draft && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-primary">
              <Mail className="size-3.5" /> Draft message
            </span>
            <span className="rounded-full bg-secondary px-1.5 py-0.5 font-mono text-[0.6rem] uppercase text-muted-foreground">
              {draft.source === "ai" ? "AI draft" : "template"}
            </span>
            <span className="ml-auto text-muted-foreground">To: the customer on this order</span>
          </div>
          <textarea
            value={draft.message}
            onChange={(e) => onEdit(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-lg border border-border bg-card p-2.5 text-sm leading-relaxed text-foreground focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          <p className="mt-1.5 text-[0.7rem] text-muted-foreground">Review and edit before sending — nothing is sent automatically.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={onDraft}>
          <Sparkles className="size-3.5" />
          {draft ? "Redraft" : "Draft message"}
        </Button>
        <Button size="sm" onClick={onResolve}>
          {draft ? <Send className="size-3.5" /> : <Check className="size-3.5" />}
          {draft ? "Send & resolve" : "Approve & resolve"}
        </Button>
      </div>
    </Card>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
        on ? "border-primary/30 bg-primary/5 text-foreground" : "border-border/70 bg-secondary/30 text-muted-foreground"
      )}
    >
      <span>{label}</span>
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-border")}>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-all", on ? "left-[1.125rem]" : "left-0.5")} />
      </span>
    </button>
  );
}
