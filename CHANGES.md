# Scheduling changes

- Updated on 2025-08-27T20:34:35
- `/api/cron`: now runs every 6 hours (`0 */6 * * *`).
- `/api/agent/monitor`: now runs every 2 hours (`0 */2 * * *`).
- `/api/agent/digest`: unchanged (daily at 05:00 UTC).

If you deploy on Vercel (Hobby/Free), these cron schedules should work without Pro.
