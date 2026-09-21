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

---

## `game/` — Strada (lume deschisă 3D)

Joc 3D în browser care reconstituie o stradă de cartier noaptea, pornind de la
fotografii: mers liber sau condus, hartă la scară 1:1, totul generat procedural
(fără assete externe). Vezi [`game/README.md`](game/README.md).

```bash
python3 -m http.server 8000   # apoi http://localhost:8000/game/
```
