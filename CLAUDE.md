# CLAUDE.md - SerpBear Cloudflare (`serpbear-cf`)

SerpBear on Cloudflare is an edge-native port of [SerpBear](https://github.com/towfiqi/serpbear), the open-source search engine position tracking and keyword rank app.

Instead of running Node.js with local SQLite files, cron loops, and disk JSON queues, `serpbear-cf` runs 100% natively on Cloudflare serverless edge primitives.

## Architecture & Primitives
- **Compute & API**: Cloudflare Workers (`cloudflare/src/worker.ts`)
- **Metadata & History**: Cloudflare D1 SQLite (`cloudflare/migrations/`)
- **Background Scrape Jobs**: Cloudflare Queues (`SERP_QUEUE`)
- **Automated Scheduling**: Cloudflare Cron Triggers (`0 0 * * *` daily check, `0 * * * *` hourly retry)
- **Raw SERP Snapshots**: Cloudflare R2 (`SERP_SNAPSHOTS`)
- **Settings & Sessions**: Cloudflare KV (`SERPBEAR_KV`)

## Commands
```bash
# Start local emulation with Wrangler
wrangler dev

# Apply D1 database migrations locally
wrangler d1 migrations apply DB --local

# Apply D1 database migrations to remote production
wrangler d1 migrations apply DB --remote

# Deploy to Cloudflare
wrangler deploy
```
