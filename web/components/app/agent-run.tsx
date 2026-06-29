"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, ListChecks, Mail, Share2, Clock, Check, Loader2, Play,
  ShieldCheck, RotateCcw, type LucideIcon,
} from "lucide-react";

import { RiskBadge } from "@/components/app/risk-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, type ScoredOrder } from "@/lib/api";
import { priorityOf, playbook, composeMessage } from "@/lib/playbook";
import { destination, routeFor } from "@/lib/connectors";
import { useLiveMode } from "@/lib/live-mode";
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

/*
  One order's journey through the 5-agent pipeline, animated. Embedded inside the
  AI Action Center so "watch one order" and "work the whole queue" live on one page.
*/
export function AgentRun({ queue }: { queue: ScoredOrder[] }) {
  const live = useLiveMode();
  const [idx, setIdx] = React.useState(0);
  const [phase, setPhase] = React.useState(-1); // -1 idle · 0..N-1 working · N awaiting approval
  const [approved, setApproved] = React.useState(false);
  const [delivery, setDelivery] = React.useState<"live" | "sim" | "failed" | null>(null);
  const order = queue.length ? queue[idx % queue.length] : undefined;

  async function approve() {
    if (!order) return;
    setApproved(true);
    if (!live.isLive) { setDelivery("sim"); return; }
    try {
      const r = await api.dispatchWebhook(live.webhook, {
        source: "Veridian",
        text: `⚠️ Veridian agent run — Order #${order.order_id.slice(0, 8)} (${priorityOf(order)}) · ${playbook(order)}`,
        order_id: order.order_id, recommended_action: playbook(order), message: composeMessage(order),
      });
      setDelivery(r.ok ? "live" : "failed");
    } catch { setDelivery("failed"); }
  }

  async function run() {
    setApproved(false);
    setPhase(-1);
    await sleep(150);
    for (let i = 0; i < AGENTS.length; i++) {
      setPhase(i);
      await sleep(900);
    }
    setPhase(AGENTS.length);
  }
  function next() {
    setIdx((i) => i + 1);
    setPhase(-1);
    setApproved(false);
    setDelivery(null);
  }

  if (!order) return null;
  const working = phase >= 0 && phase < AGENTS.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          Press play to watch the agents work the top order step by step.{" "}
          <Link href="/connections" className="font-medium text-primary hover:underline">How routing connects →</Link>
        </p>
        <div className="ml-auto flex gap-2">
          <Button onClick={run} disabled={working} size="sm">
            {working ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {working ? "Working…" : phase === AGENTS.length ? "Run again" : "Run a live agent pass"}
          </Button>
          {phase === AGENTS.length && (
            <Button variant="secondary" size="sm" onClick={next}>
              <RotateCcw className="size-4" /> Next order
            </Button>
          )}
        </div>
      </div>

      <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-secondary/20">
        <span className="font-mono text-xs text-muted-foreground">Working order</span>
        <span className="font-mono text-sm font-medium text-foreground">{order.order_id.slice(0, 16)}…</span>
        <span className="ml-auto flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="tabular-nums text-muted-foreground">{pct(order.delay_probability)}</span><RiskBadge level={order.delay_risk} label="delay" /></span>
          <span className="flex items-center gap-1.5"><span className="tabular-nums text-muted-foreground">{pct(order.low_review_probability)}</span><RiskBadge level={order.low_review_risk} label="review" /></span>
        </span>
      </Card>

      <div className="space-y-3">
        {AGENTS.map((a, i) => {
          const state = phase > i || phase === AGENTS.length ? "done" : phase === i ? "running" : "pending";
          return <AgentRow key={a.id} agent={a} state={state} order={order} last={i === AGENTS.length - 1} />;
        })}
      </div>

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
                <Button className="ml-auto" onClick={approve}>
                  <Check className="size-4" /> Approve &amp; ship
                </Button>
              </Card>
            ) : (
              <Card className="flex flex-wrap items-center gap-4 border-emerald-500/30 bg-emerald-500/5">
                <Check className="size-6 text-emerald-600" />
                <div className="min-w-0">
                  <p className="font-medium text-foreground">Resolved &amp; routed</p>
                  <p className="text-sm text-muted-foreground">
                    Worked in {AGENTS.length} steps, follow-up scheduled —{" "}
                    {delivery === "live" ? (
                      <strong className="font-medium text-emerald-700">delivered to your connected webhook for real.</strong>
                    ) : delivery === "failed" ? (
                      <strong className="font-medium text-rose-700">delivery failed (check the webhook on Integrations).</strong>
                    ) : (
                      <>routing to {routeFor(order).length} systems (simulated).</>
                    )}
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
  );
}

function AgentRow({ agent, state, order, last }: { agent: Agent; state: "pending" | "running" | "done"; order: ScoredOrder; last: boolean }) {
  return (
    <div className="relative flex gap-4">
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
