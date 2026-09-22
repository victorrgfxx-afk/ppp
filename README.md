# Repo

Two independent things live here:

1. **[Service Auto — Freeroam](GAME.md)** — a browser 3D open-world game in `public/`,
   built on a yard reconstructed 1:1 from photographs. Served at the site root.
2. **Chaos Harvester + on-Vercel agent** — the serverless harvester in `api/`,
   documented below.

---

# Chaos Harvester + On‑Vercel Agent

All‑in‑one repo: serverless harvester + watchdog agent + daily digest.
Deploy to Vercel; plug Supabase, OpenAI, Resend; optional Telegram.

## Cron schedule (UTC)
- `/api/cron` — 0 * * * * (hourly)
- `/api/agent/monitor` — */30 * * * * (every 30 minutes)
- `/api/agent/digest` — 0 5 * * * (05:00 UTC ≈ 08:00 Bucharest)

## Quick start
1) Import to Vercel
2) Set env (from `.env.example`)
3) In Supabase, run `sql/schema.sql` (or call `/api/agent/bootstrap` with `x-agent-token` if you set `DATABASE_URL`)
4) Configure inbound email to POST to `/api/ingest/email`
5) Done. Agent will monitor + self-heal and send you a daily digest.

## Notes
- Monitor kicks `/api/cron` when backlog/staleness is detected.
- Digest emails last 24h activity to `OWNER_EMAIL`.
- Keep `AGENT_BOOTSTRAP_TOKEN` secret; remove `DATABASE_URL` after bootstrap.
