"use client";

import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

interface AuthContextValue {
  /** Whether Supabase env vars are present. When false, auth is disabled. */
  configured: boolean;
  /** True until the initial session lookup resolves. */
  loading: boolean;
  session: Session | null;
  user: User | null;
  signInWithPassword: (
    email: string,
    password: string
  ) => Promise<{ error: string | null }>;
  signUpWithPassword: (
    email: string,
    password: string
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signInWithGoogle: (next?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = React.useState<Session | null>(null);
  const [loading, setLoading] = React.useState(isSupabaseConfigured);

  React.useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    let active = true;
    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      async signInWithPassword(email, password) {
        if (!client) return { error: "Authentication is not configured." };
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        return { error: error?.message ?? null };
      },
      async signUpWithPassword(email, password) {
        if (!client)
          return {
            error: "Authentication is not configured.",
            needsConfirmation: false,
          };
        const { data, error } = await client.auth.signUp({ email, password });
        if (error) return { error: error.message, needsConfirmation: false };
        // No session back => email confirmation is required by the project.
        return { error: null, needsConfirmation: !data.session };
      },
      async signInWithGoogle(next) {
        if (!client) return { error: "Authentication is not configured." };
        const redirectTo = `${window.location.origin}/auth/callback${
          next ? `?next=${encodeURIComponent(next)}` : ""
        }`;
        const { error } = await client.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo },
        });
        return { error: error?.message ?? null };
      },
      async signOut() {
        if (!client) return;
        await client.auth.signOut();
        setSession(null);
      },
    }),
    [client, loading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
