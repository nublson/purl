# Commercial Model

## Plans

### Free — $0

A fast, clean bookmarking tool. Save links and come back to them later — no AI involved.

| Dimension | Limit | Overage |
|---|---|---|
| Saved links | 100 lifetime (WEB, YOUTUBE, PDF, AUDIO) | Hard stop |

**Included features**
- Save links of any type (Web, YouTube, PDF, Audio)
- Full-text search
- Basic metadata (title, favicon, description)

**Not included**
- AI content extraction (no embeddings, no deep content processing)
- Semantic search
- AI-generated summaries
- File uploads (PDF, audio)
- YouTube & audio transcriptions
- AI chat

---

### Pro — $39 one-time

Full AI processing. Every saved item becomes queryable knowledge. Uses Purl's Anthropic key — no setup required.

| Dimension | Limit | Overage |
|---|---|---|
| Saved links | Unlimited | — |
| AI content extractions | Unlimited | — |
| AI chat messages | Unlimited | — |

**Included features**
- Everything in Free
- AI content extraction for Web, YouTube, PDF & Audio
- AI-generated summaries
- Semantic search
- PDF & audio file uploads
- YouTube & audio transcriptions
- Unlimited AI chat (powered by Purl)

---

### BYOK — Free

Bring Your Own Key. Full Pro feature set using your own Anthropic API key. Purl absorbs embedding costs.

| Dimension | Limit | Overage |
|---|---|---|
| Saved links | Unlimited | — |
| AI content extractions | Unlimited | — |
| AI chat messages | Unlimited | — |

**Included features**
- Everything in Pro
- AI chat and summaries routed through your own Anthropic API key
- You pay Anthropic directly for chat and summary usage
- Purl pays for embeddings (`text-embedding-3-small`) on your behalf

**Required**
- A valid Anthropic API key (stored encrypted, never exposed client-side)

---

## Key decisions

**Why is Free a pure bookmarking tool?**
Every AI feature has a real cost — scraping, chunking, embedding, inference. The free tier covers only what costs nothing to serve: metadata storage and full-text search. This keeps the cost model honest and makes the Pro value proposition clear.

**Why one-time payment instead of subscription?**
Personal productivity tools with a one-time purchase convert better and retain more goodwill. The AI compute cost for a typical Pro user is low enough (~$1–3/month at average usage) that a $39 one-time fee is sustainable long-term, especially as more users adopt BYOK.

**Why offer BYOK for free?**
Users who already pay Anthropic directly shouldn't pay twice. BYOK removes the biggest conversion objection for technical users and developers. Purl still earns from users who want the convenience of Purl's key (Pro), and absorbs only the negligible embedding cost for BYOK users.

**Why only require the Anthropic key for BYOK?**
Chat and summaries run on Claude (Anthropic). Embeddings use OpenAI's `text-embedding-3-small` — cheap enough (~$0.0001/1k tokens) that Purl absorbs this for all users rather than adding setup friction.

**Why no extraction cap on Pro?**
Unlimited extractions make the Pro value feel complete and remove anxiety about running out. The one-time pricing already accounts for average lifetime usage; heavy users are the exception, not the norm.
