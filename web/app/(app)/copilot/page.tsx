"use client";

import * as React from "react";
import { Bot, Send, User, Sparkles, FileText, Loader2 } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { DataBadge } from "@/components/app/data-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError, type AskResponse } from "@/lib/api";
import { pct } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  result?: AskResponse;
  isError?: boolean;
}

const SUGGESTIONS = [
  "What ROC-AUC does the delay model achieve?",
  "How is the low_review label defined?",
  "What dataset is Veridian built on?",
];

export default function CopilotPage() {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q }]);
    setLoading(true);
    try {
      const res = await api.ask(q);
      setMessages((m) => [...m, { role: "assistant", content: res.answer, result: res }]);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 503
          ? "The copilot is unavailable right now (LLM or dependencies). The prediction endpoints still work — try the Score page."
          : err instanceof Error
            ? err.message
            : "Request failed.";
      setMessages((m) => [...m, { role: "assistant", content: msg, isError: true }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col lg:h-[calc(100vh-5rem)]">
      <PageHeader
        eyebrow="Workspace"
        badge={<DataBadge kind="demo" />}
        title="AI Copilot"
        description="Ask about the data or any order's risk. Answers are grounded in the data dictionary, model card, and the real models."
      />

      <div
        ref={scrollRef}
        className="flex-1 space-y-5 overflow-y-auto rounded-2xl border border-border/60 bg-card/30 p-4 sm:p-6"
      >
        {messages.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
              <Bot className="size-6" />
            </span>
            <div>
              <p className="font-display text-lg font-semibold text-foreground">Ask the copilot</p>
              <p className="mt-1 text-sm text-muted-foreground">It only answers questions about Veridian&apos;s data and models.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border/60 bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}

        {loading && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex size-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <Bot className="size-4" />
            </span>
            <Loader2 className="size-4 animate-spin" /> Thinking…
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-4 flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the data or a model…"
          className="h-12 flex-1 rounded-full border border-border bg-card/60 px-5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        <Button type="submit" size="lg" disabled={loading || !input.trim()} className="px-5">
          <Send className="size-4" />
          <span className="hidden sm:inline">Send</span>
        </Button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg border",
          isUser ? "border-border/60 bg-secondary/60 text-muted-foreground" : "border-primary/25 bg-primary/10 text-primary"
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </span>
      <div className={cn("max-w-[85%] space-y-3", isUser && "items-end text-right")}>
        <div
          className={cn(
            "inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-primary/15 text-foreground"
              : message.isError
                ? "border border-rose-500/40 bg-rose-500/10 text-rose-700"
                : "border border-border/60 bg-secondary/40 text-foreground/90"
          )}
        >
          {message.content}
        </div>

        {message.result && message.result.model_results.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.result.model_results.map((r, i) => (
              <Badge key={i} className="border-primary/30 bg-primary/10 text-primary">
                <Sparkles className="size-3" />
                {String(r.model)}: {typeof r.probability === "number" ? pct(r.probability) : "—"}
                {r.risk_level ? ` · ${r.risk_level}` : ""}
              </Badge>
            ))}
          </div>
        )}

        {message.result && message.result.sources.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.result.sources.map((s) => (
              <Badge key={s} className="border-border/60 bg-secondary/40 text-muted-foreground">
                <FileText className="size-3" />
                {s}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
