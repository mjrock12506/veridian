import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Root middleware: refreshes the Supabase session and gates protected routes.
 * No-ops when Supabase env vars are absent (see updateSession).
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on app pages but skip Next internals and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
