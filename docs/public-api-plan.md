# Public API Plan — Links CRUD

## Scope

A versioned REST API for managing saved links programmatically. Chat is intentionally excluded — it remains a product-only feature.

Base path: `/api/v1/`

---

## Authentication

All public API requests must include an API key in the `Authorization` header:

```
Authorization: Bearer purl_sk_<token>
```

### What needs to be built

- `UserApiKey` table in Prisma:
  - `id`, `userId`, `name`, `keyHash` (SHA-256 of the raw token), `createdAt`, `lastUsedAt`
- Key generation endpoint: `POST /api/v1/keys` (authenticated via session, returns the raw token **once**)
- Key revocation endpoint: `DELETE /api/v1/keys/:id`
- Auth middleware: parse `Authorization: Bearer` header, look up `keyHash`, resolve `userId` — falls through to existing session cookie auth so the same routes work for both

Existing plan enforcement via `entitlements.ts` applies automatically once `userId` is resolved — no changes needed there.

---

## Endpoints

### `GET /api/v1/links`

List all saved links for the authenticated user.

**Query params**

| Param | Type | Description |
|---|---|---|
| `limit` | integer | Max results (default: 50, max: 100) |
| `cursor` | string | Pagination cursor (`createdAt` ISO string of last item) |
| `contentType` | string | Filter by `WEB`, `YOUTUBE`, `PDF`, `AUDIO` |

**Response `200`**

```json
{
  "data": [
    {
      "id": "cm...",
      "url": "https://example.com/article",
      "title": "Article title",
      "description": "...",
      "favicon": "https://...",
      "thumbnail": "https://..." | null,
      "domain": "example.com",
      "contentType": "WEB",
      "ingestStatus": "COMPLETED",
      "createdAt": "2025-06-01T12:00:00.000Z"
    }
  ],
  "nextCursor": "2025-05-31T..." | null
}
```

---

### `POST /api/v1/links`

Save a new link.

**Request body**

```json
{ "url": "https://example.com/article" }
```

**Response `201`** — the created link object (same shape as above)

**Error responses**

| Status | Code | When |
|---|---|---|
| `400` | — | Invalid or missing URL |
| `402` | `LIMIT_REACHED` | Free plan save limit hit |
| `401` | — | Invalid or missing API key |

---

### `GET /api/v1/links/:id`

Get a single link by ID.

**Response `200`** — link object  
**Response `404`** — not found or belongs to another user

---

### `PATCH /api/v1/links/:id`

Update a link's editable fields.

**Request body** (all fields optional, at least one required)

```json
{
  "url": "https://...",
  "title": "Custom title",
  "description": "Custom description"
}
```

**Response `200`** — updated link object  
**Response `404`** — not found

---

### `DELETE /api/v1/links/:id`

Delete a link permanently.

**Response `204`** — no body  
**Response `404`** — not found

---

## CORS

All `/api/v1/` routes will accept requests from any origin (`*`) since they are API-key authenticated — no credentials/cookies are involved. Preflight (`OPTIONS`) passthrough is handled at the route level.

---

## Rate limiting

Reuse the existing Upstash rate limiting from `proxy-rate-limit.ts`, keyed on `userId` (resolved from API key) rather than IP. Suggested limits (can be tuned):

- `POST /api/v1/links`: 60 req/min
- All other endpoints: 120 req/min

---

## Link object reference

| Field | Type | Notes |
|---|---|---|
| `id` | string | Cuid |
| `url` | string | Canonical URL |
| `title` | string | OG title or derived |
| `description` | string \| null | OG description |
| `favicon` | string | Favicon URL |
| `thumbnail` | string \| null | OG image URL |
| `domain` | string | Hostname |
| `contentType` | `WEB` \| `YOUTUBE` \| `PDF` \| `AUDIO` | Detected content type |
| `ingestStatus` | `PENDING` \| `PROCESSING` \| `COMPLETED` \| `FAILED` \| `SKIPPED` | AI processing state |
| `createdAt` | ISO 8601 string | When the link was saved |

`SKIPPED` means the user is on Free plan — metadata only, no AI extraction.

---

## What is NOT included

- **Chat** — product-only feature, no public API
- **File uploads** — `/api/upload` stays internal; file-sourced links are app-only
- **Reingest** — internal operation, not exposed
- **Semantic search** — potential future endpoint, not in this phase
- **Admin routes** — internal only

---

## Implementation order

1. `UserApiKey` Prisma migration
2. API key auth middleware layer (Bearer token lookup, falls through to session)
3. `/api/v1/links` — list (with cursor pagination)
4. `/api/v1/links` — POST (thin wrapper over existing `createLink`)
5. `/api/v1/links/:id` — GET, PATCH, DELETE
6. CORS headers on all v1 routes
7. Rate limiting keyed on `userId`
8. Key management endpoints (`POST /api/v1/keys`, `DELETE /api/v1/keys/:id`)
