# Purl SEO Audit

**Date:** March 2025  
**Scope:** Full site (technical + on-page)  
**Domain (current):** https://getpurl.vercel.app  
**Last updated:** Post-implementation (audit fixes applied except OG image)

---

## Executive Summary

Purl has a solid technical SEO base and most audit fixes are in place. **Implemented:** landing H1 + value-prop copy (Typography), semantic H1 on login/signup/verify-email, `themeColor` and `manifest.json` in root metadata, verify-email noindex and removed from sitemap.

**Remaining**
1. **OG image:** Add a default `opengraph-image` so shares show a proper card instead of a fallback.
2. **Canonical:** When you add a custom domain, set one canonical host (e.g. https://getpurl.app) in `metadataBase`, sitemap, and robots.

**Optional / later**
- About or How it works page; WebApplication schema once you have more content.

---

## Site Context (Assumed)

| Item | Notes |
|------|------|
| **Type** | SaaS (AI read-it-later / bookmarking) |
| **Primary goal** | Signups and product awareness |
| **Priority keywords** | read-it-later, save links, AI bookmarking, ask questions about saved links, Pocket alternative, etc. |
| **Scope** | Full site audit; no Search Console or analytics data reviewed |

---

## Technical SEO Findings

### Crawlability

**What’s in good shape**
- `robots.ts`: allows `/`, disallows `/home` and `/api/`, references sitemap.
- `sitemap.ts`: exists, correct format; contains only indexable public URLs (verify-email removed).
- No unintentional blocks; important public pages are allowed.

### Indexation

| # | Issue | Impact | Evidence | Fix | Priority |
|---|--------|--------|----------|-----|----------|
| 1 | No explicit canonical tags | Low | No `alternates.canonical` in metadata | Next.js uses `metadataBase` for resolution. When you add a custom domain, set one canonical host (e.g. https://getpurl.app, no www) and use it in `metadataBase` and sitemap | Medium (at launch) |

**What’s in good shape**
- Private layout has `robots: { index: false, follow: false }`.
- verify-email has `robots: { index: false, follow: false }` and is not in the sitemap.
- Public pages are indexable; no conflicting noindex on important pages.

### Technical Foundations

| # | Issue | Impact | Evidence | Fix | Priority |
|---|--------|--------|----------|-----|----------|
| 1 | No default OG/Twitter image | Medium | `twitter.card: "summary_large_image"` but no `images` in OG/Twitter metadata | Add `src/app/opengraph-image.tsx` (or `.jpg`/`.png`) and optionally `twitter-image` so shares show a branded card | High |

**What’s in good shape**
- `metadataBase: new URL("https://getpurl.vercel.app")` is set.
- `themeColor` (light/dark) and `manifest: "/manifest.json"` in root metadata.
- `public/manifest.json` exists with name, description, start_url, display, colors, empty icons.
- `lang="en"` on `<html>`.
- HTTPS and redirects are typically handled by Vercel.

### URL structure

- Public URLs are clean and descriptive: `/`, `/login`, `/signup`, `/verify-email`. No issues.

---

## On-Page SEO Findings

### Title tags

| # | Issue | Impact | Evidence | Fix | Priority |
|---|--------|--------|----------|-----|----------|
| 1 | Landing title duplicates default | Low | `(public)/page.tsx` sets same title as root default | Optional: use a distinct title for the homepage (e.g. "Purl – Save links. Ask questions. Get answers." is fine as-is) | Low |

**What’s in good shape**
- Root: title object with default + template `"%s | Purl"`.
- Login, Sign up, Verify email: unique titles; length reasonable for SERPs.

### Meta descriptions

- Root and all public pages have unique, relevant descriptions; length is suitable. No issues.

### Heading structure

**What’s in good shape**
- Landing: single H1 via `Typography component="h1" variant="h2"` with "Save links. Ask questions. Get answers."
- Login, signup, verify-email: semantic H1 via `Typography component="h1"` inside CardTitle (Log in, Create an account, Check your email).

### Content optimization (landing)

**What’s in good shape**
- Value-prop paragraph under H1 (Typography size="small"): "Purl is an AI-powered read-it-later app..." with keywords (read-it-later, save links, ask questions, AI-powered, sources). CTA links (Start for free / Sign in) follow.

### Internal linking

- Landing links to `/signup` and `/login`; login/signup cross-link. No orphan public pages. Adequate for current size.

### Images

- Public marketing/auth pages don’t use images. Link list (private) uses favicons with `alt={link.title}`. No issues for current scope.

---

## Content Quality Assessment

- **E-E-A-T:** No blog, author, or comparison pages yet; trust is carried by product and metadata. Adding a simple "About" or "How it works" page later would help.
- **Depth:** Landing has H1 + value-prop copy; minimal but sufficient for crawlers and intent.
- **Differentiation:** ABOUT.md differentiates from Pocket/Raindrop/Notion; landing copy reflects "AI-powered read-it-later" and "ask questions, get answers with sources."

---

## Prioritized Action Plan

### Done (implemented)

1. **Landing page** — H1 "Save links. Ask questions. Get answers." (Typography component="h1" variant="h2"); value-prop copy with keywords; CTA links.
2. **Auth pages** — Semantic H1 via Typography component="h1" on login, signup, verify-email.
3. **themeColor** — Root layout metadata (light/dark).
4. **manifest.json** — Created in `public/`, linked in root metadata.
5. **verify-email** — `robots: { index: false, follow: false }` in layout; removed from sitemap.

### Remaining

6. **OG/Twitter image** — Add `src/app/opengraph-image.tsx` (or static image) and optionally `twitter-image` so shared links show a proper card.
7. **Canonical (at custom domain launch)** — Set one canonical host in `metadataBase`, sitemap, and robots.

### Optional / later

8. Add an About or How it works page and link from the footer or landing for depth and E-E-A-T.
9. Consider schema (e.g. `WebApplication`) once you have more content.

---

## References

- [Next.js Metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)
- [Next.js OG Image Generation](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image)
- Skill: `seo-audit` (this audit), `schema-markup` (for future structured data), `programmatic-seo` (if you add many pages later).
