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

/** Tailwind classes for a risk badge by level. */
export const riskBadgeClass: Record<RiskLevel, string> = {
  low: "border-primary/30 bg-primary/10 text-primary",
  medium: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  high: "border-rose-500/40 bg-rose-500/10 text-rose-300",
};
