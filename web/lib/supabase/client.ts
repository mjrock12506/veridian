"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

let cached: SupabaseClient | null = null;

/**
 * Browser Supabase client (singleton). Returns null when the project is not
 * configured, so callers can fall back to the "auth not configured" state
 * instead of crashing. Sessions are stored in cookies (via @supabase/ssr) so
 * the Next.js middleware can read them to gate protected routes.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!cached) {
    cached = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return cached;
}
