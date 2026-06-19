import { Badge } from "@/components/ui/badge";
import type { RiskLevel } from "@/lib/api";
import { cn } from "@/lib/utils";
import { riskBadgeClass } from "@/lib/format";

export function RiskBadge({
  level,
  label,
  className,
}: {
  level: RiskLevel;
  label?: string;
  className?: string;
}) {
  return (
    <Badge className={cn(riskBadgeClass[level], "uppercase tracking-wide", className)}>
      <span className="size-1.5 rounded-full bg-current" />
      {label ?? level}
    </Badge>
  );
}
