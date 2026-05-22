# Production outbound proxy

Vercel functions use datacenter IPs. For most content types this is fine, but some third-party services may restrict datacenter access.

**YouTube ingestion no longer requires a proxy.** [`fetchYouTubeTranscript`](../src/lib/youtube-transcriber.ts) now uses `youtubei.js` as the InnerTube client: it first attempts the caption track (fast path), then falls back to downloading the audio stream and transcribing with OpenAI Whisper. YouTube’s audio CDN (googlevideo.com) is accessible from datacenter IPs, so `SAFE_OUTBOUND_HTTP_PROXY` is not needed for YouTube.

**Proxy:** [`safeFetch`](../src/lib/safe-outbound-fetch.ts) reads `SAFE_OUTBOUND_HTTP_PROXY` at process startup and routes outbound HTTP(S) through HTTP CONNECT when set. This is optional and primarily useful if other outbound targets (web scraping, PDF fetch) need a proxy exit IP.

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
3. Save a **YouTube** URL (e.g. `https://youtu.be/tK4NQtzfZbM`).

Expect **`COMPLETED`** ingest for Pro/trial accounts. YouTube ingestion no longer logs `youtube_transcript_skipped` for ordinary videos — that log line only appears for videos that are private, deleted, or age-restricted.

## Related env vars

| Variable | Notes |
|----------|--------|
| `SAFE_OUTBOUND_SOCKS_PROXY` | Mutually exclusive with HTTP proxy; SOCKS hop is not pinned in-app — prefer HTTP proxy. |
| `SAFE_OUTBOUND_DNS_SERVERS` | Optional comma-separated resolvers for `dns.lookup` on the **first hop** (e.g. resolving the proxy hostname). |

See table in [AGENTS.md](../AGENTS.md) under **Outbound URL fetching (`safeFetch`)**.
