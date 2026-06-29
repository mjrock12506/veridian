"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, ListChecks, Mail, Share2, Clock, Check, Loader2, Bot, Play,
  ShieldCheck, RotateCcw, type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { DataBadge } from "@/components/app/data-badge";
import { RiskBadge } from "@/components/app/risk-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/app/states";
import { api, type ScoredOrder } from "@/lib/api";
import { priorityOf, playbook, composeMessage, rank } from "@/lib/playbook";
import { destination, routeFor } from "@/lib/connectors";
import { useApi } from "@/lib/use-api";
import { pct } from "@/lib/format";
import { cn } from "@/lib/utils";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Agent = { id: string; name: string; icon: LucideIcon; role: string; verb: string };
const AGENTS: Agent[] = [
  { id: "triage", name: "Triage agent", icon: Search, role: "Scores the order and sets priority", verb: "Scoring the order…" },
  { id: "strategy", name: "Strategy agent", icon: ListChecks, role: "Chooses the right play", verb: "Selecting the playbook…" },
  { id: "outreach", name: "Outreach agent", icon: Mail, role: "Drafts the customer message", verb: "Writing the message…" },
  { id: "routing", name: "Routing agent", icon: Share2, role: "Delivers to your connected tools", verb: "Routing the action…" },
  { id: "followup", name: "Follow-up agent", icon: Clock, role: "Monitors and escalates", verb: "Setting up monitoring…" },
];

export default function AgentPage() {
  const { data, loading, error, reload } = useApi(() => api.dashboard());
  const queue = React.useMemo(
    () => (data ? data.orders.filter((o) => priorityOf(o)).sort((a, b) => rank(b) - rank(a)).slice(0, 12) : []),
    [data]
  );
  const [idx, setIdx] = React.useState(0);
  const [phase, setPhase] = React.useState(-1); // -1 idle · 0..N-1 working · N awaiting approval
  const [approved, setApproved] = React.useState(false);
  const order = queue[idx % (queue.length || 1)];

  async function run() {
    setApproved(false);
    setPhase(-1);
    await sleep(200);
    for (let i = 0; i < AGENTS.length; i++) {
      setPhase(i);
      await sleep(950);
    }
    setPhase(AGENTS.length);
  }
  function next() {
    setIdx((i) => i + 1);
    setPhase(-1);
    setApproved(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        badge={<DataBadge kind="demo" />}
        title="Agentic workflow"
        description="Watch a team of specialized agents work a single at-risk order end-to-end — triage, strategy, outreach, routing, and follow-up — handing off step by step. A human approves before anything ships."
        actions={
          order ? (
            <div className="flex gap-2">
              <Button onClick={run} disabled={phase >= 0 && phase < AGENTS.length} size="lg">
                {phase >= 0 && phase < AGENTS.length ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                {phase >= 0 && phase < AGENTS.length ? "Agents working…" : "Run the agents"}
              </Button>
              {phase === AGENTS.length && (
                <Button variant="secondary" size="lg" onClick={next}>
                  <RotateCcw className="size-4" /> Next order
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      {loading && <LoadingState label="Loading the queue…" />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && order && (
        <div className="space-y-5">
          {/* The order under work */}
          <Card className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bot className="size-5" /></span>
            <div>
              <p className="font-mono text-xs text-muted-foreground">Working order</p>
              <p className="font-mono text-sm font-medium text-foreground">{order.order_id.slice(0, 16)}…</p>
            </div>
            <div className="ml-auto flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="tabular-nums text-muted-foreground">{pct(order.delay_probability)}</span><RiskBadge level={order.delay_risk} label="delay" /></span>
              <span className="flex items-center gap-1.5"><span className="tabular-nums text-muted-foreground">{pct(order.low_review_probability)}</span><RiskBadge level={order.low_review_risk} label="review" /></span>
            </div>
          </Card>

          {/* Agent timeline */}
          <div className="space-y-3">
            {AGENTS.map((a, i) => {
              const state = phase > i || phase === AGENTS.length ? "done" : phase === i ? "running" : "pending";
              return <AgentRow key={a.id} agent={a} state={state} order={order} last={i === AGENTS.length - 1} />;
            })}
          </div>

          {/* Human approval gate */}
          <AnimatePresence>
            {phase === AGENTS.length && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                {!approved ? (
                  <Card className="flex flex-wrap items-center gap-4 border-primary/30 bg-primary/5">
                    <ShieldCheck className="size-6 text-primary" />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">Ready for your approval</p>
                      <p className="text-sm text-muted-foreground">The agents prepared everything. Nothing has been sent — you have the final say.</p>
                    </div>
                    <Button className="ml-auto" onClick={() => setApproved(true)}>
                      <Check className="size-4" /> Approve &amp; ship
                    </Button>
                  </Card>
                ) : (
                  <Card className="flex flex-wrap items-center gap-4 border-emerald-500/30 bg-emerald-500/5">
                    <Check className="size-6 text-emerald-600" />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">Resolved &amp; routed</p>
                      <p className="text-sm text-muted-foreground">
                        Order worked in {AGENTS.length} steps, delivered to {routeFor(order).length} systems, follow-up scheduled. You approved.
                      </p>
                    </div>
                    <Button variant="secondary" className="ml-auto" onClick={next}>
                      <RotateCcw className="size-4" /> Next order
                    </Button>
                  </Card>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function AgentRow({ agent, state, order, last }: { agent: Agent; state: "pending" | "running" | "done"; order: ScoredOrder; last: boolean }) {
  return (
    <div className="relative flex gap-4">
      {/* rail */}
      {!last && <span className={cn("absolute left-[19px] top-10 h-[calc(100%-1rem)] w-px", state === "done" ? "bg-primary/40" : "bg-border")} />}
      <span className={cn(
        "relative z-10 flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
        state === "done" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
          : state === "running" ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-secondary/40 text-muted-foreground"
      )}>
        {state === "done" ? <Check className="size-5" /> : state === "running" ? <Loader2 className="size-5 animate-spin" /> : <agent.icon className="size-5" />}
      </span>
      <Card className={cn("flex-1 transition-opacity", state === "pending" && "opacity-55")}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-sm font-semibold text-foreground">{agent.name}</h3>
          <span className="text-xs text-muted-foreground">{agent.role}</span>
          {state === "running" && <span className="ml-auto text-xs text-primary">{agent.verb}</span>}
          {state === "done" && <span className="ml-auto text-[0.7rem] font-medium uppercase tracking-wide text-emerald-600">done</span>}
        </div>
        <AnimatePresence>
          {state !== "pending" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
              <div className="mt-3">{renderOutput(agent.id, order)}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}

function renderOutput(id: string, o: ScoredOrder) {
  if (id === "triage") {
    return (
      <p className="text-sm text-foreground">
        Delay <strong>{pct(o.delay_probability)}</strong>, low-review <strong>{pct(o.low_review_probability)}</strong> →{" "}
        <span className={cn("font-medium", priorityOf(o) === "high" ? "text-rose-700" : "text-amber-700")}>
          {priorityOf(o) === "high" ? "HIGH" : "MEDIUM"} priority
        </span>
      </p>
    );
  }
  if (id === "strategy") return <p className="text-sm font-medium text-foreground">{playbook(o)}</p>;
  if (id === "outreach")
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm leading-relaxed text-foreground/90">
        {composeMessage(o)}
      </div>
    );
  if (id === "routing")
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {routeFor(o).map((rid) => {
          const d = destination(rid);
          return (
            <span key={rid} className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs text-foreground/80">
              <d.icon className={cn("size-3.5", d.color)} /> {d.name.split(" / ")[0]}
              <Check className="size-3 text-emerald-600" />
            </span>
          );
        })}
      </div>
    );
  return (
    <p className="text-sm text-muted-foreground">
      Monitoring for a customer reply. If unresolved in <strong className="text-foreground">24h</strong>, auto-escalate to a
      support owner and re-alert the ops channel.
    </p>
  );
}
