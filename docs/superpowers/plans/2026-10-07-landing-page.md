# Landing Page (Hero + Footer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Purl's signed-out landing page with a single centered hero (headline with a pearl-gradient signature word, description, provider buttons, free line), a still product panel in the app's own frame, and a footer, with a first-visit-only arrival animation.

**Architecture:** The page stays a static Server Component (`src/app/(public)`). New presentational components live in `src/components/landing/`. Motion is CSS only (keyframes + classes in `globals.css`), gated by a `data-landing-seen` attribute on `<html>` that a tiny inline script sets before paint from `localStorage`; a small client component writes the flag when the sequence ends.

**Tech Stack:** Next.js 16 App Router, Tailwind v4 (`globals.css` tokens, custom variants), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-landing-page-design.md`

**Skills:** build the page with `/better-interface` (Tasks 2–4) and the motion with `/animate` (Task 5), as the user asked.

## Global Constraints

- Copy, verbatim: headline "A home for your pearls" (signature word: "pearls"); sub-headline "The calm read-it-later app. Save links, PDFs, videos and audio to one quiet list, and read them when you're ready."; free line "Free · 1,000 links · No ads · No AI"; footer "Made by @nublson", links "API · MCP · Privacy · Terms · GitHub".
- Theme follows the system (`next-themes`, unchanged); designed dark-first; every new color is a token with light and dark values in `globals.css`.
- No new dependencies, no new fonts, no raster images, no third-party requests from the page; motion is CSS only (no Motion import in landing components).
- The page stays static (`export const dynamic = "force-static"` in `src/app/(public)/layout.tsx`).
- Render text via `Typography` (project rule), raw tags only for elements it doesn't cover.
- Arrival: words ~60ms apart; `blur(10px)` → `0`, `opacity 0` → `1`, `translateY(20%)` → `0`; easing `var(--ease-out-strong)`; total ≈ 1.5s; first visit only; `prefers-reduced-motion: reduce` → opacity fade only.
- Footer targets (pages arrive in piece 3; released together): `/docs/api`, `/docs/mcp`, `/privacy`, `/terms`, `https://github.com/nublson/purl`; "@nublson" → `https://github.com/nublson`.

## Review Focus

- **`localStorage` throws or is missing** (Safari private mode, blocked storage): the page renders and the animation plays; nothing throws. Pinned in Task 1 (unit tests with a throwing storage).
- **JavaScript disabled or the inline script blocked:** all content ends fully visible (CSS animations fill to the settled state). Pinned in Task 6 (e2e with scripts blocked).
- **Narrow phones (320px):** no horizontal scroll; the headline wraps cleanly with the gradient word intact; the panel stays inside the viewport. Pinned in Task 6.
- **A third provider (Apple) when its env vars exist:** the button row wraps instead of overflowing. Pinned in Task 4 (container is `flex-wrap`; Step 3 checks a temporary three-provider render, since the provider list comes from env and can't be set from e2e).
- **Return visit in the same or another tab:** no replay and no flash of hidden content (attribute set before paint). Pinned in Task 6.

---

### Task 1: First-visit flag

**Files:**
- Create: `src/lib/landing-intro.ts`
- Test: `src/lib/landing-intro.test.ts`

**Interfaces:**
- Produces:
  - `LANDING_SEEN_KEY = "purl:landing-seen"` and `LANDING_SEEN_ATTR = "data-landing-seen"`
  - `hasSeenLanding(storage: Pick<Storage, "getItem"> | null | undefined): boolean` (false when storage is missing or throws)
  - `markLandingSeen(storage: Pick<Storage, "setItem"> | null | undefined): void` (swallows errors)
  - `LANDING_SEEN_SCRIPT: string`: an IIFE that sets `LANDING_SEEN_ATTR` on `document.documentElement` when `localStorage.getItem(LANDING_SEEN_KEY)` is set, inside `try/catch`.

- [ ] **Step 1: Write the failing tests** in `src/lib/landing-intro.test.ts`:
  - `hasSeenLanding` → `true` for `{ getItem: () => "1" }`, `false` for `{ getItem: () => null }`, `false` for `null`, `false` for `{ getItem: () => { throw new Error("denied") } }`.
  - `markLandingSeen` calls `setItem("purl:landing-seen", "1")`; does not throw when `setItem` throws or storage is `null`.
  - `LANDING_SEEN_SCRIPT` evaluated with `new Function("document","localStorage", LANDING_SEEN_SCRIPT)` against a fake `document.documentElement` (`setAttribute` spy) sets `data-landing-seen` only when the fake storage returns a value, and doesn't throw when `localStorage.getItem` throws.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/landing-intro.test.ts`; expect FAIL (module missing).
- [ ] **Step 3: Implement** the four exports in `src/lib/landing-intro.ts` (no `"use client"`; plain module usable by server and client).
- [ ] **Step 4: Run** the same command; expect PASS.
- [ ] **Step 5: Commit** `feat(landing): first-visit flag for the arrival animation`.

### Task 2: Pearl tokens and the signature word

**Files:**
- Modify: `src/app/globals.css` (tokens in `:root` and `.dark`; a `@utility` or class for the gradient text)
- Create: `src/components/landing/pearl-word.tsx`

**Interfaces:**
- Produces:
  - CSS tokens `--pearl-1`…`--pearl-4` (gradient stops) and `--pearl-glow` (glow color), each with light and dark values. Starting values from the spec: dark `#f7f3ea, #d9cfbd, #c9d6e3, #efe6f2`; light `#8c7f66, #b0a184, #7f93a8, #a58aa8`; tune in the browser.
  - Class `pearl-text`: `background: linear-gradient(100deg, var(--pearl-1), var(--pearl-2) 30%, var(--pearl-3) 55%, var(--pearl-4) 80%, var(--pearl-1)); background-size: 200% 100%; background-clip: text; color: transparent` (with `-webkit-` prefix).
  - `PearlWord({ children }: { children: string })`: a `Typography component="span"` with `pearl-text` and `data-pearl-word` (Task 5 attaches the sheen to it).

- [ ] **Step 1:** Add the tokens and `pearl-text` to `globals.css`, following the file's existing `:root` / `.dark` layout.
- [ ] **Step 2:** Implement `PearlWord`.
- [ ] **Step 3: Verify** in the browser (`purl-dev` preview, a scratch render of the hero in Task 4 is enough): the word reads in both themes (contrast against `--background`), no fallback black/transparent text in Safari (WebKit e2e screenshot later).
- [ ] **Step 4: Commit** `feat(landing): pearl gradient tokens and the signature word`.

### Task 3: Product panel

**Files:**
- Create: `src/components/landing/product-preview.tsx`
- Create: `src/components/landing/preview-favicons.tsx` (inline SVG icons for the four rows)
- Modify: `src/app/globals.css` (a `.pearl-glow` background utility using `--pearl-glow`)

**Interfaces:**
- Produces: `ProductPreview({ className }: { className?: string })`: decorative (`aria-hidden="true"`), no data, no providers, no client JS. Markup hooks for Task 5: the frame has `data-landing-panel`; each row has `data-landing-row`.

- [ ] **Step 1: Implement** with `/better-interface`:
  - Frame: rounded top corners (`rounded-t-2xl`), border, no bottom border, `bg-card`/translucent per theme; header row: the logo pearl, a divider, "📚 Reading list" with a chevron, and a "Public" button look (globe icon) on the right, styled like `FolderSharePopover`'s trigger but inert (a `span`, not a `button`).
  - Rows matching `LinkItem`'s look (favicon slot, one-line truncated title + muted domain; read row in `text-muted-foreground font-normal` with a grey half-opacity favicon), at the app's row sizes (48px desktop / 56px phones). Content: "How to read more books" · paulgraham.com; "Designing calm interfaces" · youtube.com; "The case for slow software" · nytimes.com (read); "Attention is a garden" · arxiv.org (PDF); then 3 skeleton rows (`Skeleton` from `ui/`).
  - A bottom fade into `--background` (a gradient overlay), and `.pearl-glow` behind the frame.
  - Responsive: inset (`mx-[6%]`-ish) from `md`; full content width on phones, only the first 3 rows + 2 skeletons visible (`max-md:hidden` on the rest).
- [ ] **Step 2: Verify** in the browser at 390px and 1440px, dark and light: rows align like the app (favicon centered on the title line), no overflow.
- [ ] **Step 3: Commit** `feat(landing): still product panel in the app's frame`.

### Task 4: Hero, footer and page

**Files:**
- Create: `src/components/landing/landing-hero.tsx`, `src/components/landing/landing-footer.tsx`
- Modify: `src/components/provider-buttons.tsx` (add `className?: string`, merged onto the container with `cn`)
- Modify: `src/app/(public)/page.tsx`
- Delete: `src/sections/hero.tsx` (and `src/sections/` if empty)

**Interfaces:**
- Consumes: `PearlWord` (Task 2), `ProductPreview` (Task 3), `ProviderButtons`, `Logo`, `SignInErrorToast`, `getSignInButtonProviders`.
- Produces: `LandingHero({ providers }: { providers: ProviderId[] })`, `LandingFooter()`. Motion hooks for Task 5: the headline's words each wrapped in `<span data-landing-word>` (the signature word via `PearlWord`), the sub-headline `data-landing-block="sub"`, the buttons + free line wrapper `data-landing-block="actions"`.

- [ ] **Step 1: Implement** with `/better-interface`:
  - Page (`page.tsx`): top bar (`<header>`: `Logo` + "Purl"), `<main>` with `LandingHero` then `ProductPreview`, then `<LandingFooter>`; keep `SignInErrorToast` in `Suspense`.
  - Hero: centered; `<h1>` with the `h1` Typography variant, `text-balance`; sub-headline `max-w-[42ch] text-pretty`; `ProviderButtons` with `className` making a row from `sm` (`sm:flex-row sm:max-w-none sm:justify-center flex-wrap`), stacked full width below `sm`; the free line in muted small text.
  - Footer: one line from `md` (left: logo pearl + "Made by @nublson"; right: the five links), two lines below; links are `<a>` with the targets in Global Constraints (external ones `rel="noopener noreferrer"`).
- [ ] **Step 2: Run** `pnpm exec playwright test e2e/auth-gate.spec.ts e2e/security-headers.spec.ts` and any spec touching the landing page (`grep -l "Continue with" e2e`); expect PASS (provider button names unchanged).
- [ ] **Step 3: Verify** in the browser at 320, 390, 768, 1440px, dark and light: no horizontal scroll; the first screen shows the headline, buttons and the panel's top. Temporarily pass `["google", "github", "apple"]` to `LandingHero` and confirm the row wraps cleanly at 640–768px; revert.
- [ ] **Step 4: Commit** `feat(landing): new hero, product panel and footer`.

### Task 5: Arrival motion

**Files:**
- Modify: `src/app/globals.css` (keyframes + classes, scoped to `html:not([data-landing-seen])`)
- Create: `src/components/landing/landing-intro.tsx` (`"use client"`)
- Modify: `src/app/(public)/page.tsx` (render the inline script and `LandingIntro`)

**Interfaces:**
- Consumes: `LANDING_SEEN_SCRIPT`, `markLandingSeen` (Task 1); the `data-landing-*` hooks (Tasks 2–4).
- Produces: `LandingIntro()`: renders nothing; on mount, waits for the sequence to end (the sheen's `animationend` on `[data-pearl-word]`, or 1,800ms as a fallback) and calls `markLandingSeen(window.localStorage)`.

- [ ] **Step 1: Implement** with `/animate`:
  - Inline script: `<script dangerouslySetInnerHTML={{ __html: LANDING_SEEN_SCRIPT }} />` as the first child of the page, before the hero, so the attribute is set before the hero paints.
  - Keyframes (all `both` fill, so content ends visible even without JS): `landing-arrive` (blur 10px → 0, opacity 0 → 1, translateY 20% → 0) for `[data-landing-word]` with per-word delays ~60ms apart (`--i` index set inline), then `[data-landing-block="sub"]` and `[data-landing-block="actions"]` as blocks after the headline, then `[data-landing-panel]` and its `[data-landing-row]`s one after another; `landing-sheen` (background-position 100% → 0) once on `[data-pearl-word]` at the end. Total ≈ 1.5s; easing `var(--ease-out-strong)`.
  - All of it only under `html:not([data-landing-seen])` and `@media (prefers-reduced-motion: no-preference)`; under `reduce`, a 200ms opacity-only fade on the same elements, no sheen.
  - Nothing blocks interaction (`pointer-events` untouched).
- [ ] **Step 2: Verify** in the browser: first load plays the sequence; reload doesn't (attribute present, no flash); with DevTools' reduced motion emulation, only a fade. Play at 0.25× in the Animations panel and check the stagger and the sheen's timing.
- [ ] **Step 3: Commit** `feat(landing): first-visit arrival animation and pearl sheen`.

### Task 6: End-to-end tests and docs

**Files:**
- Create: `e2e/landing.spec.ts`
- Modify: `CLAUDE.md` (route groups: the landing page's pieces and the first-visit flag)

- [ ] **Step 1: Write** `e2e/landing.spec.ts`, signed out (`test.use({ signedIn: false })`):
  - renders the headline "A home for your pearls", the sub-headline, `getByRole("button", { name: "Continue with Google" })` and GitHub, the free line, and the five footer links with their `href`s from Global Constraints;
  - first visit: `html` has no `data-landing-seen`, `[data-landing-word]` has a running animation (`getAnimations().length > 0`); after it ends, `localStorage["purl:landing-seen"] === "1"`; reload: `html[data-landing-seen]` present and no running animations on `[data-landing-word]`;
  - `test.use({ reducedMotion: "reduce" })`: no animation on `[data-landing-word]` uses `filter` or `transform` (check the computed `animation-name`);
  - scripts blocked (`page.route("**/*", r => r.request().resourceType() === "script" ? r.abort() : r.continue())`): after 2s, the headline, buttons and panel have computed `opacity: "1"`;
  - at 320px: `document.documentElement.scrollWidth <= 320`;
  - screenshots at 390px and 1440px in `colorScheme: "dark"` and `"light"` to `testInfo.outputPath()`.
- [ ] **Step 2: Run** `pnpm exec playwright test e2e/landing.spec.ts`; expect PASS in Chromium and WebKit.
- [ ] **Step 3: Run** the full checks: `pnpm typecheck`, `pnpm lint` (no new warnings), `pnpm test`, `pnpm test:e2e`; expect all PASS.
- [ ] **Step 4:** Update `CLAUDE.md`: the landing page (components in `src/components/landing/`, first-visit flag `purl:landing-seen` / `data-landing-seen`, CSS-only motion, released with piece 3's pages).
- [ ] **Step 5: Commit** `test(landing): e2e for content, first-visit motion and fallbacks`.
