# Commercial Model

## Plans

### Free — $0

The starting point. Users can save and organize links across all content types, with a taste of AI chat to feel the product's value.

| Dimension | Limit | Overage |
|---|---|---|
| Saved links | 100 lifetime (WEB, YOUTUBE, PDF, AUDIO) | Hard stop |
| AI content extractions | 0 — links saved as metadata only | — |
| AI chat messages | 20 / month | Hard stop |

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

---

### Pro — $9 / month

Full AI processing. Every saved item becomes queryable knowledge.

| Dimension | Limit | Overage |
|---|---|---|
| Saved links | Unlimited | — |
| AI content extractions | 400 / month (all content types) | Hard stop |
| AI chat messages | Unlimited | — |

**Included features**
- Everything in Free
- AI content extraction for Web, YouTube, PDF & Audio
- AI-generated summaries
- Semantic search
- PDF & audio file uploads
- YouTube & audio transcriptions
- Unlimited AI chat

---

## Key decisions

**Why gate on extractions, not saves?**
Saving a link (metadata only) is cheap. The real cost is running the AI ingest pipeline — scraping, chunking, embedding. Free users can build a full library; the upgrade incentive is making that library smart.

**Why 400 extractions for Pro?**
At typical usage (10–20 saves/week) that's a 5–10 month runway before hitting the cap, making it feel effectively unlimited for most users while keeping compute costs predictable.

**Why unlimited chat for Pro?**
Chat is the primary value driver. Capping it on a paid plan creates friction at exactly the wrong moment. The extraction cap is the natural cost control.

**Why $9/month?**
Positions below Readwise Reader ($7.99–13) and Notion AI ($10 add-on) while covering AI compute costs at average Pro usage (~100 chat turns + ~50 extractions/month ≈ $3–5 in API costs).
