"use client";

import * as React from "react";

/**
 * App shell wrapper around the authenticated routes.
 *
 * Guest mode: the app is fully browsable on the shared demo data without
 * signing in, so this no longer gates, redirects, or shows an "auth not
 * configured" banner — the shell stays clean for guests regardless of whether
 * Supabase env vars are set. Auth remains available everywhere (logged-in
 * sessions still resolve via <AuthProvider>; see the sidebar GuestBadge /
 * UserMenu and /login). Kept as a component so re-enabling per-route gating
 * later is a single-seam change.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
