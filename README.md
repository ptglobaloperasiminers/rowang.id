# rowang.id — AI Identity Platform v3

## What this is
Multi-tenant personal AI clone platform. Users log in via Google (invite-only),
build their AI clone through interview, voice, memories, and media, then
reach 85% to unlock and 95% to sell their clone.

## Mixed model strategy
| Task | Model | Why |
|---|---|---|
| Background extraction | Haiku | Fast, cheap, good enough |
| AI Interview | Sonnet | Smart conductor, affordable |
| Clone chat | Opus | Premium — where Julius is judged |
**Result: ~75% cheaper than Opus-only**

## Deploy
1. Supabase → SQL Editor → run rowang-v3-schema-FINAL.sql → create 'rowang-media' storage bucket (public)
2. Google Cloud Console → create OAuth 2.0 credential → redirect: https://rowang.id/api/auth/callback/google
3. GitHub → push this repo (make it private)
4. Vercel → import repo → set Framework to Next.js → add all env vars → Deploy
5. Vercel → Settings → Domains → add rowang.id → update DNS

## Add new users (admin)
In Supabase SQL Editor:
  INSERT INTO registered_emails (email, name)
  VALUES ('newuser@gmail.com', 'Their Name')
  ON CONFLICT (email) DO NOTHING;

## Registered users (pre-loaded in schema)
- pt.globaloperasiminers@gmail.com (Julius Martono Sugiharto)
- mediakomindo@gmail.com (Julius Martono Sugiharto)
# rowang.id
