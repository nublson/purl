# Production outbound proxy (YouTube transcripts)

Vercel functions use datacenter IPs. YouTube often omits caption tracks in player responses for those IPs, so transcript ingestion can fail while the same video works locally (see [`src/lib/youtube-transcriber.ts`](../src/lib/youtube-transcriber.ts)).

**No app code changes are required.** [`safeFetch`](../src/lib/safe-outbound-fetch.ts) reads `SAFE_OUTBOUND_HTTP_PROXY` at process startup and routes all outbound HTTP(S) through an HTTP CONNECT proxy, including YouTube oEmbed, transcript fetches, and general link ingest.

## 1. Get a proxy URL (HTTP CONNECT)

**Recommended starter: [Webshare](https://www.webshare.io)** — free tier includes residential-style proxies suitable for low-volume caption fetch.

1. Create an account and open **Proxy List** (or equivalent).
2. Copy credentials in URL form:

   ```text
   http://<username>:<password>@p.webshare.io:80
   ```

   Your proxy URL **must** use `http://` or `https://` (see validation in `safe-outbound-fetch.ts`). Do not commit this URL to git.

**Alternatives** (same URL shape): Bright Data, Oxylabs, Smartproxy — any provider that offers **HTTP CONNECT** with auth.

## 2. Set `SAFE_OUTBOUND_HTTP_PROXY` on Vercel (Production)

**Option A — CLI** (from repo root, project linked):

```bash
vercel env add SAFE_OUTBOUND_HTTP_PROXY production
```

Paste the full proxy URL when prompted.

**Option B — Dashboard**

Project → **Settings** → **Environment Variables** → add:

| Name | Value | Environment |
|------|--------|-------------|
| `SAFE_OUTBOUND_HTTP_PROXY` | `http://user:pass@host:port` | Production only (or Preview too if you want parity) |

Never expose this variable to the browser (`NEXT_PUBLIC_*`).

## 3. Redeploy

The Undici dispatcher is created when the module loads. **Redeploy production** after changing the variable:

```bash
vercel --prod
```

Or trigger **Redeploy** from the Vercel deployment UI.

## 4. Smoke-test

After deploy:

1. Save a normal **HTTPS article** URL.
2. Save a **PDF** URL.
3. Save a **YouTube** URL that previously failed transcript on prod (e.g. `https://youtu.be/tK4NQtzfZbM`).

Expect **`COMPLETED`** ingest for Pro/trial accounts. In function logs:

- Success through proxy often means **no** `youtube_transcript_skipped` line for that save (full transcript path).
- If you still see `youtube_transcript_skipped`, captions may be genuinely unavailable or the proxy exit IP is still blocked — try another proxy / provider tier.

Also confirm general saves still work (proxy must allow your upstream targets and be reachable from Vercel regions).

## Related env vars

| Variable | Notes |
|----------|--------|
| `SAFE_OUTBOUND_SOCKS_PROXY` | Mutually exclusive with HTTP proxy; SOCKS hop is not pinned in-app — prefer HTTP proxy. |
| `SAFE_OUTBOUND_DNS_SERVERS` | Optional comma-separated resolvers for `dns.lookup` on the **first hop** (e.g. resolving the proxy hostname). |

See table in [AGENTS.md](../AGENTS.md) under **Outbound URL fetching (`safeFetch`)**.
