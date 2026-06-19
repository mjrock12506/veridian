"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, ChevronRight } from "lucide-react";

import { RiskBadge } from "@/components/app/risk-badge";
import { Card } from "@/components/ui/card";
import type { ScoredOrder } from "@/lib/api";
import { brl, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

type SortKey = "delay_probability" | "low_review_probability" | "total_price";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "delay_probability", label: "Delay risk" },
  { key: "low_review_probability", label: "Low-review risk" },
  { key: "total_price", label: "Order value" },
];

export function OrdersTable({ orders }: { orders: ScoredOrder[] }) {
  const router = useRouter();
  const [sortKey, setSortKey] = React.useState<SortKey>("delay_probability");
  const [dir, setDir] = React.useState<"asc" | "desc">("desc");

  const sorted = React.useMemo(() => {
    return [...orders].sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return dir === "desc" ? Number(bv) - Number(av) : Number(av) - Number(bv);
    });
  }, [orders, sortKey, dir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setDir("desc");
    }
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">Scored orders</h3>
          <p className="text-xs text-muted-foreground">{orders.length} delivered orders · ranked by risk</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Order</th>
              <th className="px-5 py-3 font-medium">Category</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-5 py-3 font-medium">
                  <button
                    className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                    onClick={() => toggleSort(c.key)}
                  >
                    {c.label}
                    <ArrowUpDown className={cn("size-3.5", sortKey === c.key ? "text-primary" : "opacity-50")} />
                  </button>
                </th>
              ))}
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((o) => (
              <tr
                key={o.order_id}
                onClick={() => router.push(`/orders/${o.order_id}`)}
                className="group cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/40"
              >
                <td className="px-5 py-3">
                  <span className="font-mono text-xs text-foreground/90">{o.order_id.slice(0, 10)}…</span>
                  <div className="text-xs text-muted-foreground">{o.customer_state ?? "—"} · {o.purchase_date ?? "—"}</div>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{o.main_category ?? "—"}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-foreground">{pct(o.delay_probability)}</span>
                    <RiskBadge level={o.delay_risk} />
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-foreground">{pct(o.low_review_probability)}</span>
                    <RiskBadge level={o.low_review_risk} />
                  </div>
                </td>
                <td className="px-5 py-3 tabular-nums text-muted-foreground">{brl(o.total_price)}</td>
                <td className="px-5 py-3 text-right">
                  <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
