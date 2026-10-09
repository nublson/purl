# Rebrand: from "read-it-later" to "save and share" — design

## Why

Purl was described as a read-it-later app, but that's not what it is any more. Shared folders (`/@username/slug`), their preview images, folder emojis and descriptions, and the public `@purl` demo are about collecting and showing links, not working through a reading queue. Purl is a place to save the links you find interesting and want to see later, and to share them.

## Decisions

- **Positioning: keep, then share.** The personal collection comes first; sharing a folder is the natural next step.
- **Scope: words only.** The name, logo, pearl metaphor, headline ("A home for your pearls") and the free line ("Free · 1,000 links · No ads · No AI") stay. No product changes: read/unread state and its "Mark as read" wording stay.
- **Category line:** "a calm place to save and share the links you find" (no jargon category such as "bookmarking").

## Copy

| Surface | Text |
|---|---|
| Landing sub-headline (`src/components/landing/landing-hero.tsx`, asserted in `e2e/landing.spec.ts`) | Save the links worth keeping, all in one calm place. Share a folder when one’s worth passing on. |
| Meta / Open Graph / Twitter description (`src/app/layout.tsx`) | Purl is a calm place to save and share the links you find. Keep articles, PDFs, videos and audio in folders, and share any folder with a link. |
| PWA manifest (`public/manifest.json`) | A calm place to save and share the links you find. |
| MCP registry listing (`server.json`, version 0.1.12 → 0.1.13 so it can be republished) | Save, organize and share your Purl links from any MCP client. |
| README tagline | **Save the links worth keeping. Share the ones worth passing on.** |
| README intro / CLAUDE.md "What is Purl" | Purl is a calm place to save and share the links you find — a home for your "pearls". |
| `.cursor/rules/purl-context.mdc` | Rewritten: it still described the removed AI chat and embeddings. Now a short, accurate summary that points to CLAUDE.md. |

## Out of scope

- `thumbnail.jpeg` (README banner) has "Save Anything. Keep what matters." baked into the image; replacing it needs a new image.
- Dated specs, plans and `docs/SEO-AUDIT.md` keep their wording as records of their time.
