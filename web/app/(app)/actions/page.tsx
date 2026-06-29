"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Sparkles, Send, Check, Loader2, Zap, Inbox, ShieldCheck, Flame, Mail,
} from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { DataBadge } from "@/components/app/data-badge";
import { StatCard } from "@/components/app/stat-card";
import { RiskBadge } from "@/components/app/risk-badge";
import { LoadingState, ErrorState } from "@/components/app/states";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, type ScoredOrder, type DraftMessageResult } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { num, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_QUEUE = 24;

type Priority = "high" | "medium";

function priorityOf(o: ScoredOrder): Priority | null {
  if (o.delay_risk === "high" || o.low_review_risk === "high") return "high";
  if (o.delay_risk === "medium" || o.low_review_risk === "medium") return "medium";
  return null;
}
function playbook(o: ScoredOrder): string {
  if (o.delay_risk === "high") return "Expedite shipping + notify the customer";
  if (o.low_review_risk === "high") return "Proactive apology + support outreach";
  if (o.delay_risk === "medium") return "Confirm the delivery ETA with the carrier";
  return "Schedule a post-delivery check-in";
}

// Instant, on-brand draft tailored to the order's risk + details. Kept client-side
// so the demo is snappy and reliable for a quick visitor (the /draft-message LLM
// endpoint stays in the codebase to show the integration; this powers the demo).
function composeMessage(o: ScoredOrder): string {
  const where = o.customer_state ? ` in ${o.customer_state}` : "";
  const what = o.main_category ? ` of ${o.main_category.replace(/_/g, " ")}` : "";
  if (o.delay_risk === "high" || o.delay_risk === "medium") {
    return `Hi! We're keeping a close eye on your recent order${what} to make sure it reaches you${where} as quickly as possible. If the delivery timeline shifts we'll let you know right away — and you can reply here any time. Thanks so much for your patience!`;
  }
  if (o.low_review_risk === "high" || o.low_review_risk === "medium") {
    return `Hi! Thank you for your order${what}. We want to be sure you're completely happy with it — if anything isn't quite right, just reply and we'll put it right straight away. We really appreciate your business!`;
  }
  return `Hi! Thanks for your order${what} — it's on track. We're here if you need anything at all, so don't hesitate to reach out. We appreciate you!`;
}
const rank = (o: ScoredOrder) =>
  (priorityOf(o) === "high" ? 1000 : 0) + Math.max(o.delay_probability, o.low_review_probability);

export default function ActionsPage() {
  const { data, loading, error, reload } = useApi(() => api.dashboard());
  const [resolved, setResolved] = React.useState<Record<string, string>>({});
  const [drafts, setDrafts] = React.useState<Record<string, DraftMessageResult>>({});
  const [autopilot, setAutopilot] = React.useState(false);
  const [rules, setRules] = React.useState({ autoDelay: true, escalate: true, digest: false });

  const atRisk = React.useMemo(
    () => (data ? data.orders.filter((o) => priorityOf(o)).sort((a, b) => rank(b) - rank(a)).slice(0, MAX_QUEUE) : []),
    [data]
  );
  const queue = atRisk.filter((o) => !resolved[o.order_id]);
  const resolvedList = atRisk.filter((o) => resolved[o.order_id]);
  const highOpen = queue.filter((o) => priorityOf(o) === "high").length;
  const coverage = atRisk.length ? Math.round((resolvedList.length / atRisk.length) * 100) : 0;

  function draftFor(o: ScoredOrder) {
    setDrafts((d) => ({ ...d, [o.order_id]: { message: composeMessage(o), source: "ai" } }));
  }
  const resolveOne = (o: ScoredOrder) => setResolved((r) => ({ ...r, [o.order_id]: playbook(o) }));
  const editDraft = (id: string, text: string) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], message: text } }));

  async function runAutopilot() {
    setAutopilot(true);
    for (const o of queue) {
      await sleep(240);
      setResolved((r) => ({ ...r, [o.order_id]: playbook(o) }));
    }
    setAutopilot(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        badge={<DataBadge kind="demo" />}
        title="AI action center"
        description="The AI triages every at-risk order by priority, recommends a playbook, and drafts the customer outreach for you. Resolve them — or let auto-pilot work the queue — and watch high-risk fall."
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
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={Inbox} label="Needs action" value={num(queue.length)} hint="at-risk, open" />
            <StatCard icon={Flame} label="High priority" value={num(highOpen)} hint="open & high risk" />
            <StatCard icon={ShieldCheck} label="Resolved" value={num(resolvedList.length)} hint="actioned by you / AI" />
            <StatCard icon={Bot} label="Coverage" value={`${coverage}%`} hint="of at-risk handled" />
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <div className="text-sm">
              <p className="font-medium text-foreground">You&apos;re always in control</p>
              <p className="mt-0.5 leading-relaxed text-muted-foreground">
                Veridian <strong className="font-medium text-foreground">drafts</strong> messages and{" "}
                <strong className="font-medium text-foreground">recommends</strong> actions — you review, edit, and send.
                Nothing reaches a customer automatically, and contact details stay in your own data; Veridian never messages customers directly.
              </p>
            </div>
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
                label="Daily 9am risk digest" />
            </div>
          </Card>

          <div>
            <h3 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-foreground">
              Priority queue
              <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-xs text-muted-foreground">{queue.length}</span>
            </h3>
            {queue.length === 0 ? (
              <Card className="flex items-center gap-3 text-sm text-muted-foreground">
                <ShieldCheck className="size-5 text-emerald-600" /> Queue clear — every at-risk order has an action applied.
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

          {resolvedList.length > 0 && (
            <div>
              <h3 className="mb-3 font-display text-base font-semibold text-foreground">Resolved</h3>
              <Card className="divide-y divide-border/50 p-0">
                {resolvedList.map((o) => (
                  <div key={o.order_id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <Check className="size-4 shrink-0 text-emerald-600" />
                    <span className="font-mono text-xs text-foreground/80">{o.order_id.slice(0, 10)}…</span>
                    <span className="text-muted-foreground">{resolved[o.order_id]}</span>
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

function OrderCard({
  o, draft, onDraft, onResolve, onEdit,
}: {
  o: ScoredOrder;
  draft?: DraftMessageResult;
  onDraft: () => void;
  onResolve: () => void;
  onEdit: (text: string) => void;
}) {
  const isHigh = priorityOf(o) === "high";
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wide",
              isHigh ? "bg-rose-500/10 text-rose-700" : "bg-amber-500/10 text-amber-700")}>
              {isHigh ? "High priority" : "Medium"}
            </span>
            <span className="font-mono text-xs text-foreground/80">{o.order_id.slice(0, 12)}…</span>
            <span className="text-xs text-muted-foreground">{o.customer_state ?? "—"} · {o.main_category ?? "—"}</span>
          </div>
          <p className="mt-2 text-sm font-medium text-foreground">{playbook(o)}</p>
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
          {draft ? "Send & resolve" : "Mark resolved"}
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
