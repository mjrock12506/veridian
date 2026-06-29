import { FlaskConical, Database } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Makes the source of what's on screen unmistakable:
 * - "demo"  -> this page runs on the public Olist sample (not your data)
 * - "yours" -> these are the orders you uploaded
 */
export function DataBadge({ kind, className }: { kind: "demo" | "yours"; className?: string }) {
  const demo = kind === "demo";
  const Icon = demo ? FlaskConical : Database;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.7rem] uppercase tracking-[0.12em]",
        demo
          ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
        className
      )}
    >
      <Icon className="size-3" />
      {demo ? "Demo · Olist sample" : "Your orders"}
    </span>
  );
}
