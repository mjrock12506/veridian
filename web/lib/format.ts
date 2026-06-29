import type { RiskLevel } from "@/lib/api";

/** Format a 0–1 probability as a percentage string. */
export function pct(p: number | null | undefined, digits = 1): string {
  if (p === null || p === undefined || Number.isNaN(p)) return "—";
  return `${(p * 100).toFixed(digits)}%`;
}

/** Brazilian Real currency formatting. */
export function brl(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v);
}

export function num(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** Tailwind classes for a risk badge by level (semantic, not the brand accent). */
export const riskBadgeClass: Record<RiskLevel, string> = {
  low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  high: "border-rose-500/40 bg-rose-500/10 text-rose-700",
};
