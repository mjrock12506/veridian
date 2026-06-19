"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";

/**
 * Client-side gate for the authenticated app shell.
 *
 * Three states:
 *  - Auth NOT configured: render the app but show a clear banner so it stays
 *    usable locally before a Supabase project exists.
 *  - Configured + resolving/redirecting: show a spinner. The Next.js middleware
 *    already redirects unauthenticated requests server-side; this is the
 *    client-side backstop for soft navigations.
 *  - Configured + signed in: render the app.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { configured, loading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (configured && !loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [configured, loading, user, router, pathname]);

  if (configured && (loading || !user)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {!configured && <AuthNotConfiguredBanner />}
      {children}
    </>
  );
}

function AuthNotConfiguredBanner() {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-400" />
      <div className="text-amber-100/90">
        <p className="font-medium text-amber-200">Authentication is not configured</p>
        <p className="mt-1 text-amber-100/70">
          The app is running without sign-in because{" "}
          <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
          are unset. Add them to <code className="font-mono text-xs">.env.local</code>{" "}
          to protect these routes. See{" "}
          <Link href="/login" className="underline underline-offset-2">
            the sign-in page
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
