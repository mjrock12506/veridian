"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail, ShieldAlert, ArrowLeft, CheckCircle2 } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/site/logo";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const { configured } = useAuth();

  return (
    <main className="relative flex min-h-screen items-center justify-center px-5 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.10),transparent)]" />
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to site
        </Link>
        <Card className="p-7">
          <div className="mb-6">
            <Logo />
          </div>
          {configured ? (
            <React.Suspense
              fallback={<Loader2 className="size-5 animate-spin text-muted-foreground" />}
            >
              <LoginForm />
            </React.Suspense>
          ) : (
            <NotConfigured />
          )}
        </Card>
      </div>
    </main>
  );
}

function LoginForm() {
  const { signInWithPassword, signUpWithPassword, signInWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const [mode, setMode] = React.useState<Mode>("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(
    searchParams.get("error")
  );
  const [info, setInfo] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    if (mode === "signin") {
      const { error } = await signInWithPassword(email, password);
      if (error) {
        setError(error);
        setBusy(false);
        return;
      }
      router.replace(next);
      router.refresh();
    } else {
      const { error, needsConfirmation } = await signUpWithPassword(
        email,
        password
      );
      if (error) {
        setError(error);
        setBusy(false);
        return;
      }
      if (needsConfirmation) {
        setInfo("Check your email to confirm your account, then sign in.");
        setMode("signin");
        setBusy(false);
        return;
      }
      router.replace(next);
      router.refresh();
    }
  }

  async function onGoogle() {
    setBusy(true);
    setError(null);
    const { error } = await signInWithGoogle(next);
    if (error) {
      setError(error);
      setBusy(false);
    }
    // On success the browser is redirected to Google, so no further action.
  }

  return (
    <div>
      <h1 className="font-display text-xl font-semibold tracking-tight">
        {mode === "signin" ? "Sign in to Veridian" : "Create your account"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {mode === "signin"
          ? "Access the risk dashboard, copilot, and scoring tools."
          : "Start predicting and preventing bad orders."}
      </p>

      <Button
        type="button"
        variant="secondary"
        className="mt-6 w-full"
        onClick={onGoogle}
        disabled={busy}
      >
        <GoogleIcon /> Continue with Google
      </Button>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border/60" />
        or
        <span className="h-px flex-1 bg-border/60" />
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Email
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-secondary/40 px-3.5 text-sm outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-ring/40"
            placeholder="you@company.com"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Password
          </span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-secondary/40 px-3.5 text-sm outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-ring/40"
            placeholder="••••••••"
          />
        </label>

        {error && (
          <p className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <ShieldAlert className="mt-px size-3.5 shrink-0" /> {error}
          </p>
        )}
        {info && (
          <p className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            <CheckCircle2 className="mt-px size-3.5 shrink-0" /> {info}
          </p>
        )}

        <Button type="submit" className="mt-1 w-full" disabled={busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <Mail className="size-4" />
              {mode === "signin" ? "Sign in" : "Sign up"}
            </>
          )}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {mode === "signin" ? "New to Veridian?" : "Already have an account?"}{" "}
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={() => {
            setMode((m) => (m === "signin" ? "signup" : "signin"));
            setError(null);
            setInfo(null);
          }}
        >
          {mode === "signin" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </div>
  );
}

function NotConfigured() {
  return (
    <div>
      <h1 className="font-display text-xl font-semibold tracking-tight">
        Authentication not configured
      </h1>
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-400" />
        <div>
          <p>
            Sign-in is disabled because the Supabase environment variables are
            not set. The app still runs locally without authentication.
          </p>
          <p className="mt-2 text-amber-100/70">
            To enable accounts, set{" "}
            <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
            and{" "}
            <code className="font-mono text-xs">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </code>{" "}
            in <code className="font-mono text-xs">web/.env.local</code>.
          </p>
        </div>
      </div>
      <Button asChild variant="secondary" className="mt-6 w-full">
        <Link href="/dashboard">Continue to the app</Link>
      </Button>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.65 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1S8.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12S6.8 21.5 12 21.5c5.6 0 9.3-3.9 9.3-9.4 0-.6-.07-1.1-.16-1.6H12z"
      />
    </svg>
  );
}
