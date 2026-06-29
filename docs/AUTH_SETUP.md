# Authentication setup — Google + email

Veridian ships with **email/password and Google sign-in fully built** (Supabase +
`@supabase/ssr`, with the OAuth callback and protected-route session refresh
already wired). The app runs in **guest mode** until you point it at a Supabase
project — then login turns on automatically. The `/login` page shows the form as a
preview until then.

Setup is ~2 minutes:

## 1. Create a free Supabase project

[supabase.com](https://supabase.com) → **New project**. Open **Settings → API** and
copy the **Project URL** and the **anon public** key.

## 2. Add the keys to the web app

Create `web/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

Restart `npm run dev`. **Email/password sign-up and sign-in now work at `/login`.**

## 3. Enable Google sign-in (optional)

1. Supabase dashboard → **Authentication → Providers → Google → Enable**.
2. Google Cloud Console → **APIs & Services → Credentials → Create OAuth client ID
   → Web application**. Under *Authorized redirect URIs* add the callback URL
   Supabase shows you: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
3. Paste the Google **Client ID** and **Client secret** back into Supabase and save.

"Continue with Google" on `/login` now works.

## 4. Set the site URL

Supabase → **Authentication → URL Configuration** → set **Site URL** (e.g.
`http://localhost:3000` locally, or your Vercel URL in production). The app already
handles the return at `/auth/callback`; `web/middleware.ts` refreshes the session
on protected routes.

## Troubleshooting: `provider is not enabled` (400)

This error means the sign-in method itself is toggled **off** in the project:

- **Email/password:** Supabase → **Authentication → Providers → Email → Enable**.
  For an instant demo with no inbox round-trip, also turn **off** "Confirm email"
  (Authentication → Providers → Email → *Confirm email*) so sign-up logs straight in.
- **Google:** enable it per section 3 above (the provider toggle **and** the OAuth
  client ID/secret are both required).
- After enabling, set **Site URL + Redirect URLs** (section 4) to your live URL
  (e.g. `https://veridian-lyart.vercel.app`) or Google/email links bounce back.

## Notes

- The **anon key is public** (safe in the browser). Never expose the service-role key.
- **Guest mode stays available** — the demo is fully usable without an account.
- On **Vercel**, set the same `NEXT_PUBLIC_*` variables in the project's
  Environment Variables, then redeploy.
