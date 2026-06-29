"use client";

import * as React from "react";
import Link from "next/link";
import { Lock, Loader2, ShieldCheck } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Gates a "your data" feature behind a signed-in account. The public demo stays
 * open everywhere else; only features that touch the visitor's own data require
 * registration. When Supabase isn't configured (a fresh local clone) it shows a
 * notice but doesn't hard-block, so the project is still demoable.
 */
export function RequireAuth({ next, children }: { next?: string; children: React.ReactNode }) {
  const { configured, loading, session } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (session) return <>{children}</>;

  return (
    <Card className="mx-auto mt-2 flex max-w-lg flex-col items-center gap-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
        <Lock className="size-6" />
      </span>
      <div>
        <h2 className="font-display text-xl font-semibold text-foreground">Sign in to use your own data</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Scoring your own orders is for <strong className="font-medium text-foreground">registered accounts</strong>.
          Your data is processed in your browser, scored ephemerally, and never stored or shared.
          The demo stays open without an account.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Sign in or create an account</Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/dashboard">Explore the demo instead</Link>
        </Button>
      </div>
      {!configured && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" /> Local demo mode — add Supabase keys to enforce this gate.
        </p>
      )}
    </Card>
  );
}
