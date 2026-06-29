"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plug, Share2, Clock, Check, Loader2, ArrowRight, ShieldCheck, Database,
  FileSpreadsheet, Lock, Webhook, type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { DataBadge } from "@/components/app/data-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DESTINATIONS, type Connector } from "@/lib/connectors";
import { cn } from "@/lib/utils";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The 3 phases of how the platform acts in an external tool.
const PHASES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Plug, title: "1 · Connect (once)", body: "You authorize Veridian in the tool via OAuth. It stores a token — permission to act as you. No password is shared." },
  { icon: Share2, title: "2 · Route actions", body: "When an agent decides to act, a per-tool adapter uses that stored token to call the tool's API — sending the email, posting to Slack, opening a ticket." },
  { icon: Clock, title: "3 · Follow up", body: "Webhooks (or polling) tell Veridian when the customer replies. If it's unresolved past the SLA, the follow-up agent escalates — another routed action." },
];

// What a routed action actually sends, per destination (illustrative request).
const TRACE: Record<string, { method: string; url: string; body: string }> = {
  email: { method: "POST", url: "gmail.googleapis.com/v1/users/me/messages/send", body: '{ "to": "customer", "subject": "About your order", "body": "<the AI draft>" }' },
  slack: { method: "POST", url: "slack.com/api/chat.postMessage", body: '{ "channel": "#ops", "text": "⚠️ Order #a1b2 · 78% delay risk · expedited + customer notified" }' },
  sheets: { method: "POST", url: "sheets.googleapis.com/v4/spreadsheets/.../values:append", body: '{ "values": [["a1b2", "HIGH", "delay 78%", "expedite", "sent"]] }' },
  support: { method: "POST", url: "yourco.zendesk.com/api/v2/tickets.json", body: '{ "ticket": { "subject": "Proactive: at-risk order a1b2", "priority": "high" } }' },
  crm: { method: "POST", url: "api.hubapi.com/crm/v3/objects/notes", body: '{ "properties": { "hs_note_body": "Outreach sent for at-risk order a1b2" } }' },
};

type Status = "idle" | "connecting" | "connected";

export default function ConnectionsPage() {
  const [status, setStatus] = React.useState<Record<string, Status>>({});
  const [step, setStep] = React.useState<Record<string, number>>({}); // OAuth sim step
  const [open, setOpen] = React.useState<string | null>(null);

  async function connect(c: Connector) {
    const steps = [`Redirecting to ${c.name.split(" / ")[0]}…`, "You approve the requested access", "Exchanging code for a token", "Token stored — connected"];
    setStatus((s) => ({ ...s, [c.id]: "connecting" }));
    for (let i = 0; i < steps.length; i++) {
      setStep((p) => ({ ...p, [c.id]: i }));
      await sleep(650);
    }
    setStatus((s) => ({ ...s, [c.id]: "connected" }));
    setOpen(c.id);
  }
  const OAUTH_STEPS = (name: string) => [`Redirecting to ${name}…`, "You approve the requested access", "Exchanging code for a token", "Token stored — connected"];

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        badge={<DataBadge kind="demo" />}
        title="Integrations"
        description="How Veridian's agents act in your tools. Connecting a tool stores a permission token; the routing agent then uses it to deliver actions, and the follow-up agent watches for the reply. Try a connect below to see the flow."
      />

      <div className="space-y-6">
        {/* status banner */}
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <Lock className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <p className="leading-relaxed text-muted-foreground">
            <strong className="font-medium text-foreground">Decision layer is live; delivery layer is simulated.</strong>{" "}
            The agents already decide what to do and where it should go. Connecting a tool here{" "}
            <strong className="font-medium text-foreground">demonstrates the OAuth flow</strong> — no real token is stored and no
            real message is sent. Wiring one real connector is the next build.
          </p>
        </div>

        {/* lifecycle */}
        <div className="grid gap-3 lg:grid-cols-3">
          {PHASES.map((ph, i) => (
            <Card key={ph.title} className="relative">
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><ph.icon className="size-5" /></span>
                <h3 className="font-display text-sm font-semibold text-foreground">{ph.title}</h3>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{ph.body}</p>
              {i < PHASES.length - 1 && <ArrowRight className="absolute -right-[18px] top-1/2 z-10 hidden size-5 -translate-y-1/2 text-muted-foreground/30 lg:block" />}
            </Card>
          ))}
        </div>

        {/* connectors */}
        <div>
          <h3 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-foreground">
            <Share2 className="size-4 text-primary" /> Action destinations
          </h3>
          <div className="space-y-3">
            {DESTINATIONS.map((c) => {
              const st = status[c.id] ?? "idle";
              const tr = TRACE[c.id];
              return (
                <Card key={c.id} className="overflow-hidden">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-secondary/40">
                      <c.icon className={cn("size-5", c.color)} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.blurb}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      {st === "connected" ? (
                        <>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            <Check className="size-3.5" /> Connected (demo)
                          </span>
                          <Button size="sm" variant="ghost" onClick={() => setOpen(open === c.id ? null : c.id)}>
                            {open === c.id ? "Hide" : "Show"} what it sends
                          </Button>
                        </>
                      ) : st === "connecting" ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-primary">
                          <Loader2 className="size-3.5 animate-spin" /> {OAUTH_STEPS(c.name.split(" / ")[0])[step[c.id] ?? 0]}
                        </span>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => connect(c)}>
                          <Plug className="size-3.5" /> Connect
                        </Button>
                      )}
                    </div>
                  </div>

                  <AnimatePresence>
                    {st === "connected" && open === c.id && tr && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <div className="mt-3 rounded-xl border border-border/60 bg-secondary/30 p-3">
                          <p className="mb-2 text-xs text-muted-foreground">When the routing agent acts on an order, the adapter calls:</p>
                          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[0.7rem] leading-relaxed text-foreground/90">
{`${tr.method} ${tr.url}
Authorization: Bearer <your stored token>

${tr.body}`}
                          </pre>
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700"><Check className="size-3.5" /> 200 OK — delivered (simulated)</p>
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Webhook className="size-3.5" /> Follow-up agent then watches for a reply via webhook/polling and escalates if unresolved in 24h.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              );
            })}
          </div>
        </div>

        {/* inbound note */}
        <Card className="flex items-start gap-3 bg-secondary/20">
          <Database className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Inbound data</p>
            <p className="mt-0.5 leading-relaxed text-muted-foreground">
              Orders come in via <FileSpreadsheet className="inline size-3.5" /> CSV upload on{" "}
              <a href="/connect" className="text-primary hover:underline">Connect store</a> today. Live store sync
              (&ldquo;Login with Shopify&rdquo;) uses the same OAuth pattern shown above — connect once, then Veridian pulls
              orders on a schedule.
            </p>
          </div>
        </Card>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 text-emerald-600" />
          A real build would store tokens encrypted per workspace and never expose them to the browser.
        </div>
      </div>
    </div>
  );
}
