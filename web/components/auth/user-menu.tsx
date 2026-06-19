"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";

/**
 * Shows the signed-in user's email with a sign-out button. Renders nothing when
 * auth is not configured or no user is present, so the app shell stays clean in
 * local/unauthenticated mode.
 */
export function UserMenu() {
  const { configured, user, signOut } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  if (!configured || !user) return null;

  async function onSignOut() {
    setBusy(true);
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2.5">
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold uppercase text-primary">
        {(user.email ?? "?").slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground" title={user.email ?? ""}>
          {user.email}
        </p>
        <p className="text-[0.65rem] text-muted-foreground">Signed in</p>
      </div>
      <button
        type="button"
        onClick={onSignOut}
        disabled={busy}
        aria-label="Sign out"
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
      </button>
    </div>
  );
}
