import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  isSupabaseConfigured,
} from "./config";

/**
 * Per-request session refresh, run from the root middleware.
 *
 * When Supabase is not configured this is a no-op pass-through, so the app
 * keeps working locally without auth. When configured, it refreshes the auth
 * cookies so logged-in users keep a valid session.
 *
 * Guest mode: the app is publicly browsable on the shared demo data, so this
 * intentionally does NOT redirect unauthenticated users away from app routes.
 * Auth stays fully available (see /login) for when we re-enable gating.
 */
export async function updateSession(
  request: NextRequest
): Promise<NextResponse> {
  if (!isSupabaseConfigured) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: getUser() validates the token with the Supabase Auth server and
  // must be called to keep the session fresh; do not insert logic between this
  // and returning `response`. We intentionally do NOT gate on the result —
  // guests browse the demo freely; this call only refreshes existing sessions.
  await supabase.auth.getUser();

  return response;
}
