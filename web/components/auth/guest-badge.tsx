"use client";

import Link from "next/link";

import { useAuth } from "@/components/auth/auth-provider";

/**
 * Subtle, non-blocking indicator shown to guests (anyone browsing the demo
 * without an account). Makes it clear that accounts exist without nagging or
 * gating any functionality. Renders nothing while the session resolves or once
 * a user is signed in — the <UserMenu> takes over in that case.
 */
export function GuestBadge() {
  const { loading, user } = useAuth();
  if (loading || user) return null;

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2.5">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className="size-1.5 rounded-full bg-primary/70" aria-hidden />
        Demo mode
      </span>
      <Link
        href="/login"
        className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
      >
        Sign in to save
      </Link>
    </div>
  );
}
