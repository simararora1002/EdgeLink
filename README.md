# EdgeLink

A small link shortener with rate-limited link creation. It is built with Next.js (App Router), tRPC v11, Drizzle ORM and libSQL/Turso, and written to run on **Cloudflare Workers**.

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env      # DATABASE_URL=file:local.db (local SQLite file)
npm run db:migrate        # apply Drizzle migrations to local.db
npm run dev               # http://localhost:3000
npm test                  # vitest: 20 tests
```

To use a real Turso database, set `DATABASE_URL=libsql://…turso.io` and `DATABASE_AUTH_TOKEN`, then run `npm run db:migrate`. This is the configuration you'd use on Workers.

## How it's organised

| Concern | Where | Notes |
|---|---|---|
| Schema | `src/db/schema.ts` | `links` (unique `slug`, index on `owner_id, created_at`) and `rate_limit_hits` |
| DB client | `src/db/client.ts` | Built **per request**. Uses the HTTP (`/web`) libSQL client for remote DBs, which works on Workers. |
| Create / list | `src/server/routers/links.ts` | tRPC `links.create` mutation and `links.list` query |
| Rate limiter | `src/server/rate-limit.ts` | Sliding window, one atomic SQL statement |
| Redirect | `src/app/[slug]/route.ts` → `src/server/redirect.ts` | Atomic `clicks = clicks + 1 … RETURNING`, then a 302 |
| Page | `src/app/page.tsx` | Server Component |
| List (server) | `src/app/_components/links-table.tsx` | Server Component. Loads the first data **in-process** via `createCaller` (no HTTP round trip), so the HTML arrives already filled in. |
| List (live) | `src/app/_components/live-links-table.tsx` | Client Component. Starts from the server's rows, then polls `links.list` through tRPC every 2s (and when you return to the tab) so click counts stay live. |
| Form | `src/app/_components/create-link-form.tsx` | Client Component. Runs the mutation, then re-fetches the list and quota right away. Shows the result with Copy/Open buttons. |
| Quota meter | `src/app/_components/quota-meter.tsx` | Shows 5 dots plus a countdown to the next free slot. Reads `links.quota`, a **read-only** check that never uses a slot. It's for display only; the real enforcement stays in `links.create`. |

### Live click counts: polling, not push
The server renders the list first, so there's no loading spinner. A client component then polls `links.list` every 2s while the tab is visible and re-fetches as soon as you come back to the tab. True push (WebSocket/SSE) would need a Durable Object on Workers to hold connections and send updates. That's too much for a click counter, and a 2s delay is acceptable here.

## Key decisions

### Rate limiting on a stateless edge runtime
The limit is **5 creates per user per rolling 60s**.

- **Not in memory.** Each Workers isolate has its own memory and can be evicted at any time. A `Map` counter would give each isolate or location a separate budget and would reset at random.
- **Stored in the shared database, as a sliding-window log.** The check and the write are **one statement**:
  ```sql
  INSERT INTO rate_limit_hits (id, key, ts)
  SELECT ?, ?, ?
  WHERE (SELECT COUNT(*) FROM rate_limit_hits WHERE key = ? AND ts > now - 60s) < 5
  RETURNING id
  ```
  SQLite/libSQL runs writes one at a time, so concurrent requests can't both pass the check. A "SELECT count, then INSERT" version has a race. I checked this: a naive version let more than 5 of 20 parallel requests through. The test suite has a 20-parallel-request test that requires **exactly 5** to succeed.
- **Sliding, not fixed window.** A fixed per-minute bucket lets 10 requests through in about 2 seconds around a minute boundary. A test covers this.
- Rejected attempts **aren't recorded**, so retrying while limited doesn't extend the wait. A test covers this too.
- The error is a tRPC `TOO_MANY_REQUESTS` (HTTP 429) with a "try again in Ns" message, shown in the form.

Alternatives I considered:
- **Cloudflare Rate Limiting binding:** counts per location and is eventually consistent, so it isn't exact.
- **KV:** eventually consistent, with no atomic increment.
- **Durable Object per user:** the best production fit. Each user's counter lives in one place that handles requests one at a time, so there's no database round trip on the hot path. It wasn't worth the setup for this exercise.

### Redirect
- `UPDATE links SET clicks = clicks + 1 WHERE slug = ? RETURNING target_url` runs as one statement, so concurrent clicks are never lost. A test sends 25 parallel hits and checks that 25 are counted.
- It returns a **302** with `cache-control: no-store`. A 301 is cached by browsers, so later visits would never reach the server and clicks would stop being counted.

### Safety
- Target URLs must be `http:` or `https:`. zod's `.url()` alone accepts `javascript:` and `data:` URLs.
- Slugs come from `crypto.getRandomValues` (Web Crypto), not `Math.random`, and use rejection sampling to avoid modulo bias. The unique index plus a retry handles collisions.

### Workers compatibility
- Only Web APIs are used at runtime (`fetch`, `crypto`, `Request`/`Response`). tRPC uses the fetch adapter.
- No module-level DB connection or other state shared between requests.
- The Node libSQL client is loaded only for local `file:` URLs; Workers has no filesystem, so that path never runs there. Deploying would use `@opennextjs/cloudflare` with `DATABASE_URL` and `DATABASE_AUTH_TOKEN` set as secrets. I haven't deployed it.

## Tests
`npm test` runs 20 tests against a real SQLite file with the real migrations.

- `tests/rate-limit.test.ts`:
  - 5 allowed, the 6th rejected, with the correct retry-after
  - sliding window at a minute boundary
  - recovers after the window passes
  - rejected attempts aren't counted
  - **20 concurrent requests → exactly 5 allowed**
  - each user has a separate limit
- `tests/links-router.test.ts`, through the real tRPC router with `createCaller`:
  - create works
  - rejects `javascript:`, `data:`, `ftp:` and invalid URLs
  - the 6th create returns `TOO_MANY_REQUESTS` and writes nothing
  - invalid input doesn't use up the limit
  - retries on a slug collision
  - the list is scoped to the owner and newest first
- `tests/redirect.test.ts`:
  - 302 with `Location` and `no-store`
  - click counting
  - 25 concurrent clicks all counted
  - 404 for an unknown slug

## Known limitations / with more time
- A rate-limit slot is used *before* the insert, so if the insert then fails, that slot is lost. It's fine at 5/min. The fix is to run both in one batch or transaction.
- The rate limiter costs 2–3 database round trips per create. A Durable Object would remove those.
- Expired rate-limit rows are only cleaned up when the same user creates again; a cron trigger would sweep the rest.
- There's no real auth (`user_demo` is hard-coded) and no pagination (the list is capped at 100).
- Live counts come from polling (about 2s behind, and one request every 2s per open tab). At scale, a per-user Durable Object could push updates over WebSockets instead.
