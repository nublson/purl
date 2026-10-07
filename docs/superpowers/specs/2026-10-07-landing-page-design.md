# Landing page: hero and footer

Date: 2026-10-07 · Status: approved design, pending spec review

## Context

Today's landing page (`src/app/(public)/page.tsx`, `src/sections/hero.tsx`) is a headline, one sentence and two sign-in buttons. A conversion audit (2026-10-06) found it asks strangers to sign in before showing anything: no picture of the product, no statement that it's free, and no privacy or terms links next to an OAuth sign-in. (It also flagged `/login` and `/signup` as 404s; that was wrong: both have redirected to `/` since 2026-09-26.) Traffic is low (197 views of `/` in 14 days, 79% desktop), so the redesign is judged on first principles, not A/B data.

Reference: [interfere.com](https://interfere.com/) and its write-up ([How we built Interfere's new website](https://interfere.com/blog/how-we-built-interferes-new-website)): one signature word in the headline, a plain description, the product as the hero visual built in code (skeleton UI for unimportant parts), one visual thread, and restrained motion played once.

## Scope

This is piece 1 of 3:

1. **This spec:** the hero and footer, with a still product panel.
2. The interactive demo (try Purl without signing in) fills the panel later. Own spec.
3. The footer's pages: API, MCP, Privacy, Terms, restored from commit `f4cfd0d` (2026-09-25) and updated. Own spec.

**Pieces 1 and 3 are released together**, so the footer never links to missing pages and Privacy/Terms sit next to sign-in from day one.

Out of scope: an app-wide theme default or theme switch, import from other read-it-later apps, any section below the hero.

## Page and structure

- `/` stays static (`force-static` in `src/app/(public)/layout.tsx`), served from the CDN; the proxy keeps validating the session only to send signed-in users to `/home`.
- Top to bottom, the page is exactly:
  1. **Top bar:** the pearl logo (the existing `Logo`, `/logo.svg`) and "Purl" on the left; nothing on the right (sign-in is in the hero).
  2. **Hero:** centered.
  3. **Product panel:** under the hero, rising from the bottom of the first screen.
  4. **Footer.**
- The sign-in error toast (`SignInErrorToast`) stays.

## Hero content

- **Headline (`<h1>`):** "A home for your *pearls*". The word "pearls" carries the pearl gradient (see Theme).
- **Sub-headline:** "The calm read-it-later app. Save links, PDFs, videos and audio to one quiet list, and read them when you're ready."
- **Buttons:** "Continue with Google" and "Continue with GitHub" (the existing `ProviderButtons`, so Apple appears too when its env vars exist). Side by side from `sm`; stacked, full width, below it.
- **Under the buttons:** "Free · 1,000 links · No ads · No AI" (small, muted).
- Text is centered; the headline balances across lines (`text-wrap: balance`), the sub-headline avoids orphans (`text-pretty`), max ~42ch.

## Theme

- The page follows the system setting like the rest of the app (`next-themes`, `defaultTheme="system"`): no new switch, no forced theme. It is **designed dark-first**, and the light version is designed and checked too.
- Colors come from the app's tokens (`globals.css`). Two additions, defined as tokens with light and dark values:
  - **Pearl gradient** for the signature word: cream → blue → lilac on dark (e.g. `#f7f3ea → #d9cfbd → #c9d6e3 → #efe6f2`); deeper hues of the same on light (e.g. `#8c7f66 → #b0a184 → #7f93a8 → #a58aa8`) so the word holds contrast on white.
  - **Pearl glow:** a soft radial glow behind the product panel, low opacity, tuned per theme.
- Final values are tuned in the browser against both backgrounds; the word must stay readable (it's large display text).

## Motion

Played **on a visitor's first visit only**; later visits render the settled page.

1. **Headline:** word by word. Each word goes from `filter: blur(10px)`, `opacity: 0`, `translateY(20%)` to settled, ~60ms apart.
2. **Sub-headline**, then **buttons + free line**: each arrives as one block with the same blur/opacity/rise, slightly after the headline.
3. **Product panel:** rises in last; its rows arrive one after another (the app's row arrival).
4. **Sheen:** one slow sheen crosses "pearls" as the final beat (a background-position sweep on the gradient). Plays once; never loops.

- Total about 1.5s. Everything is interactive from the first frame (no `pointer-events` blocking).
- Built with CSS (keyframes on classes), no animation library on this page. Easing from the app's tokens (`--ease-out-strong`).
- **First-visit flag:** an inline script in the page sets `data-landing-seen` on `<html>` before first paint when `localStorage` has `purl:landing-seen`, and the animation classes only apply without it; the flag is written after the sequence ends. Storage errors (private mode) fall back to playing it.
- **Reduced motion** (`prefers-reduced-motion: reduce`): a plain opacity fade only; no blur, rise or sheen.
- Caveat accepted: content that starts at `opacity: 0` delays LCP on a first visit; the short, first-visit-only sequence limits it.

## Product panel

- **Frame:** the app's own: a header with the pearl, "📚 Reading list ⌄" and a "🌐 Public" button, above the list. Rounded top corners, no bottom edge; the list fades into the page background at the bottom. The pearl glow sits behind it.
- **Content:** four real rows (a page, a video, one read row faded back, a PDF) in the app's row style (`LinkItem`'s look), then skeleton rows. Placeholder content until piece 2 designs the demo's folder.
- **Build:** a presentational component, `ProductPreview` (`src/components/landing/product-preview.tsx`), using the app's tokens and row classes, no data fetching, no app providers. Piece 2 replaces its insides with the live demo in the same frame.
- **Favicons:** small inline SVG icons, not external images, so the page makes no third-party requests.
- Decorative for assistive tech: the panel is `aria-hidden` (its content isn't interactive yet); the hero text carries the meaning.
- Responsive: inset from the page edges on desktop; on phones, the panel spans the content width and shows fewer rows.

## Footer

- One line, under the product panel: the pearl + "Made by @nublson" (links to github.com/nublson) on the left; **API · MCP · Privacy · Terms · GitHub** on the right (GitHub links to github.com/nublson/purl).
- In a `<footer>`; links are real `<a>`s; muted text, the app's link styles.
- On phones it stacks into two short lines.
- The API, MCP, Privacy and Terms targets come from piece 3; routes are named there (current candidates from `f4cfd0d`: `/docs/api`, `/docs/mcp`, `/privacy`, `/terms`).

## Files

- `src/app/(public)/page.tsx`: the new page composition.
- `src/sections/hero.tsx`: removed; the hero moves to `src/components/landing/landing-hero.tsx` (with `src/sections/` deleted if it ends up empty).
- `src/components/landing/landing-hero.tsx`, `product-preview.tsx`, `landing-footer.tsx`, `pearl-word.tsx` (the signature word), `landing-motion.ts(x)` (first-visit flag script + classes).
- `src/app/globals.css`: pearl gradient and glow tokens, landing keyframes.
- `src/components/provider-buttons.tsx`: a `className` prop for the container, so the hero lays the buttons out in a row from `sm`.
- `src/proxy.ts`: unchanged (`/` behavior stays; piece 3 adds its pages to the public routes).

## Speed and accessibility

- No raster images (only the existing logo SVG) and no new fonts on the page; motion is CSS only. The page stays static.
- One `<h1>`; landmarks: the top bar in a `<header>`, the hero and panel in `<main>`, the footer in `<footer>`. The sign-in buttons keep their accessible names.
- Contrast: body and muted text meet the app's existing contrast in both themes; the gradient word is checked against both backgrounds.
- Keyboard: buttons and footer links in visual order; visible focus rings (the app's).

## Testing

- Existing sign-in e2e tests keep passing (provider buttons, error toast).
- New e2e (`e2e/landing.spec.ts`), signed out:
  - the headline, sub-headline, both provider buttons, free line and footer links render;
  - the arrival plays on a first visit (animation classes present) and not on the next (`data-landing-seen` set);
  - with `reducedMotion: 'reduce'`, no blur/rise/sheen animation runs;
  - screenshots at 390px and 1440px in dark and light for review.
- Unit test for the first-visit flag helper (storage present, absent, throwing).
