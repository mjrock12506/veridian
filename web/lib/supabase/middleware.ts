import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  isProtectedPath,
  isSupabaseConfigured,
} from "./config";

/**
 * Per-request session refresh + route gating, run from the root middleware.
 *
 * When Supabase is not configured this is a no-op pass-through, so the app
 * keeps working locally without auth. When configured, it refreshes the auth
 * cookies and redirects unauthenticated users away from protected routes to
 * the login page (preserving the intended destination via ?next=).
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
  // and returning `response`.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  if (!user && isProtectedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
