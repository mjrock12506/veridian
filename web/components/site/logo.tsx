import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden
        className="shrink-0"
      >
        <circle cx="16" cy="16" r="14" stroke="hsl(var(--primary))" strokeOpacity="0.25" strokeWidth="1.5" />
        <path
          d="M5 16a11 11 0 0 1 22 0"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M9 21l5 5 9-13"
          stroke="hsl(var(--primary))"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="16" r="2.4" fill="hsl(var(--primary))" />
      </svg>
      <span className="font-display text-lg font-semibold tracking-tight text-foreground">
        Veridian
      </span>
    </span>
  );
}
