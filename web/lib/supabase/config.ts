/**
 * Supabase configuration, read from public env vars at build/runtime.
 *
 * Both values are intentionally optional: when they are absent the app still
 * runs locally with authentication disabled (an "auth not configured" state),
 * so a fresh clone works before a Supabase project exists. Never hardcode the
 * URL or key here — they come only from the environment.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

/** True only when both Supabase env vars are present, so auth can be enforced. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** App routes that require an authenticated session when auth is configured. */
export const PROTECTED_PREFIXES = ["/dashboard", "/copilot", "/score", "/orders"];

/** Whether a pathname falls under a protected route prefix. */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}
