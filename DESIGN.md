# Design System: Purl
**Project ID:** `nublson/purl` (no Stitch project; this document is synthesized from the codebase: `src/app/globals.css`, `src/components/ui/*`, `src/components/typography.tsx`, `src/lib/og-theme.ts`)

Purl is a calm place to save and share the links you find: your "pearls". Everything below is in service of that one word, *calm*.

## 1. Visual Theme & Atmosphere

**Quiet, monochrome, and content-first.** Purl is an almost entirely achromatic interface: the only colours on screen are the ones the user brings in (favicons, thumbnails, folder emoji) and one warm accent, the pearl itself. The chrome recedes so a saved link's own identity reads first.

- **Mood:** calm, unhurried, soft-spoken. Nothing shouts; hierarchy comes from weight and tone, never from hue.
- **Density:** airy but not sparse. Rows are 48px (56px on phones) with generous 16px gutters; grids breathe with 16px gaps widening to 40px on larger screens.
- **Materials:** flat surfaces separated by hairlines and faint tints rather than drop shadows. Elevation is rare and reserved for the floating search field, menus and dialogs.
- **Theme:** follows the system, dark first. Light mode is pure white paper with charcoal ink; dark mode is near-black with off-white ink. Both share the same structure, so the product feels like one object seen in two lights.
- **Motion:** swift and decisive. Entering elements fade in with a short blur clearing (200ms) on a strong ease-out curve. Pressed controls scale down slightly (0.96 for buttons, 0.98 for cards). Everything respects reduced motion by dropping slides, zooms and blurs and keeping only fades.
- **The pearl:** a soft cream disc with a radial highlight is the brand's single warm note. On the landing page it casts a faint glow upward behind the product panel, like light from under a surface.

## 2. Color Palette & Roles

All tokens are defined in OKLCH on `:root` and `.dark`; hex values below are their sRGB equivalents (Tailwind's neutral scale).

### Light mode

| Name | Hex | Role |
|---|---|---|
| Paper White | `#ffffff` | Page background, cards, popovers, dialogs. |
| Charcoal Ink | `#0a0a0a` | Body text, headlines, card text. |
| Deep Graphite | `#171717` | Primary buttons and filled toggles; also the text on secondary/accent surfaces. |
| Near-White | `#fafafa` | Text on primary (dark) buttons. |
| Whisper Grey | `#f5f5f5` | Secondary and muted fills, hover tints (`accent`), keycaps, skeletons. |
| Hairline Grey | `#e5e5e5` | Borders and input strokes, menu separators. |
| Stone Grey | `#737373` | Muted text (domains, descriptions, placeholders), and the solid focus ring (≥3:1 against every surface). |
| Signal Red | `#dc2626` | Destructive actions, drawn at 10–20% tint behind red text; never as a solid fill. |
| Pearl Cream | `#eae0c8` | The outer edge of the pearl mark's radial gradient (centre is white). |
| Pearl Glow (light) | `rgb(176 161 132 / 0.35)` | The warm shadow cast upward from the landing panel's top edge. |

### Dark mode

| Name | Hex | Role |
|---|---|---|
| Ink Black | `#0a0a0a` | Page background (the browser theme colour is `#09090b`). |
| Off-White | `#fafafa` | Body text, headlines. |
| Graphite Card | `#171717` | Cards, popovers, dialogs, the floating search field. |
| Slate Tint | `#262626` | Secondary and muted fills, hover tints, keycaps. |
| Soft Grey | `#a3a3a3` | Muted text. |
| Platinum | `#e5e5e5` | Primary buttons (light-on-dark inversion); text on them is Graphite `#171717`. |
| Hairline (dark) | `rgba(255,255,255,0.10)` | Borders and card rings. Inputs use a slightly stronger `rgba(255,255,255,0.15)`. |
| Signal Red (dark) | `#f87171` | Destructive text, over a 20–30% red tint. |
| Pearl Glow (dark) | `rgb(247 243 234 / 0.30)` | The panel glow, cooler and brighter to read against black. |

### How colour is used

- **No brand hue in the UI.** Primary is a grey inversion (dark fill in light mode, light fill in dark mode). Accent, secondary and muted are the *same* faint tint used for hover, selection and resting fills.
- **Contrast is deliberate.** The focus ring is Stone Grey, chosen to hit 3:1 against background, muted and primary fills alike. Keycaps in light mode use foreground at 70% opacity (≈7:1) rather than muted text. Highlighted menu rows add an inset ring at 40% foreground, since the tint alone is ~1.2:1.
- **Surfaces, not lines.** Rows highlight with the accent tint at 40% opacity on hover and 60% when selected. Hairlines (`ring-1 ring-foreground/10`) outline cards, menus and dialogs; they firm up to 25% on hovered cards.
- **Thumbnails and favicons are the colour.** A favicon sits inside a 1px inset outline at 10% black (light) or 10% white (dark) so bright icons don't float.

## 3. Typography Rules

**One family, Inter, with its optical-size axis enabled**, so headlines automatically take Inter's tighter display cut while body text keeps the text cut. Rendered antialiased.

| Role | Size / leading | Weight | Tracking | Colour |
|---|---|---|---|---|
| Hero headline (`h1`) | 36px → 46px from md, line-height 1.1 | Semibold 600 | −0.03em (tight) | Foreground |
| Section title (`h2`) | 36px → 54px from md, line-height 1.1 | Semibold 600 | −0.03em | Foreground |
| Subheading (`h3`) | 24px, tight | Semibold 600 | −0.02em | Foreground |
| Minor heading (`h4`) | 20px, tight | Semibold 600 | −0.015em | Foreground |
| Body ("regular") | 16px, line-height 1.5 | Regular 400 | normal | Muted |
| Small | 14px, line-height 1.5 | Regular 400 | normal | Muted |
| Mini / labels | 12px, snug | Regular 400 | +0.015em (slightly open) | Muted |
| Link titles (rows and cards) | 14px (16px in phone rows) | Medium 500 | normal | Foreground |
| Wordmark "Purl" | 18px | Semibold 600 | −0.01em | Foreground |
| Buttons, badges, keycaps | 14px / 12px | Medium 500 | normal | By surface |

Rules of thumb:

- Headlines are balanced (`text-balance`); body copy is pretty-wrapped and capped around 42ch on the landing page.
- The default text colour for prose is **muted grey**, with foreground reserved for titles and names. This is what makes the pages feel quiet.
- Row titles are always one line with a character ellipsis; card titles clamp to two lines. Domains and secondary lines are 12–13px muted.
- Numbers that update (progress "2/8", elapsed time) are tabular.
- Headings in Notion-rendered static pages start at level 2; the page title is the only `h1`.

## 4. Component Stylings

The base radius is **10px** (`--radius: 0.625rem`); everything derives from it: 6px (sm), 8px (md), 10px (lg), 14px (xl), 18px (2xl), 26px (4xl, used for pills).

* **Buttons:** softly rounded (8px), 36px tall by default with 32px and 24px compact sizes, medium 14px text, icons at 16px. The **primary** button is a solid grey inversion (Graphite fill with near-white text in light mode; Platinum fill with graphite text in dark) that lightens to 80% on hover. **Outline** buttons sit on the page background with a hairline border and a whisper-thin shadow, tinting on hover. **Ghost** buttons are invisible until hovered. **Destructive** buttons are red text over a 10% red wash, never a solid red block. Every button presses to 96% scale (except link-style buttons and menu triggers), and focus draws a 3px ring in Stone Grey. Icon buttons are square at 36px, 32px or 24px; touch targets are extended invisibly to 44px.
* **Sign-in buttons (landing):** outline style with the provider's icon at 16px, laid out in a row from small screens.
* **Pills and badges:** fully rounded (26px radius on a 20px-tall badge), 12px medium text. The landing "New" badge is a hairline-bordered pill with a muted inner chip.
* **Cards (link cards):** 10px corners, card background, a 1px hairline ring at 10% foreground that strengthens to 25% on hover, no drop shadow. A 16:10 thumbnail sits flush at the top with no inner radius; beneath it a 16px favicon, a two-line medium title and a truncated muted domain, padded 12–16px. Image and video cards are the media alone, shaped to the media's own ratio. The whole card is the control and presses to 98%.
* **Rows (list view):** 48px tall (56px on phones), 8px corners, no borders between rows. A 20px favicon (24px on phones), a one-line medium title, and a muted second line. Hover and open-menu states are a 40% accent wash; selection is 60%. Row actions float over the right edge on a fade of the row's own colour, so titles use the full width.
* **Search field (omnibox):** the one raised object on the page. A 44px pill-ish bar with 14px corners, pinned 16px above the bottom edge, on popover background with a layered shadow (a 1px border ring, a tight 2px shadow at 12% black, and a soft 24px shadow at 24% black). It sits over a solid-to-transparent band of page background so rows scrolling under it never show through.
* **Inputs:** 36px tall, 8px corners, transparent background with a hairline stroke (15% white in dark mode, on a 30% input tint), 16px text on phones and 14px from md, muted placeholders, the same 3px Stone Grey focus ring, red stroke and 20% red ring when invalid.
* **Switches:** pill track, 16px round thumb on the page background colour, filled with the primary inversion when on; a hidden 44px haptic target around them on touch screens.
* **Checkboxes:** small squares that appear on hover (or always while selecting), checkmark at 14px.
* **Menus and popovers:** 10px corners, popover background, 4px inner padding, a hairline ring and a medium shadow. They open with a 100ms fade and 95%→100% zoom sliding 8px from their anchor. Keyboard focus draws a ring; pointer hover only tints. Separators are 1px hairlines.
* **Dialogs:** 14px corners, popover background, 24px padding, hairline ring, over a 10% black scrim with a faint backdrop blur. On phones a dialog becomes a full-height sheet with square corners.
* **Tooltips:** inverted: foreground fill with background text, 8px corners, 12px text, a small rotated-square arrow. Keycaps inside them switch to a 20% background tint.
* **Keycaps (`Kbd`):** 20px tall, 6px corners, muted fill, 12px medium text at 70% foreground.
* **Skeletons:** muted fill, 8px corners, a gentle pulse.
* **Toasts:** Sonner, offset 72px from the bottom to clear the search field, with 16px line icons.
* **The pearl mark:** a 24px disc (32px in the logo file) with a radial gradient from white at the upper-left to Pearl Cream at the edge. It is decorative; the wordmark carries the name.
* **Landing product panel:** 18px top corners only, a hairline border without a bottom edge, a background mixed 80% card / 20% page, and the pearl glow cast upward behind its top edge.

## 5. Layout Principles

- **Two column widths.** The private app (Home, folders, shared lists) lives in a centred column of **672px** (`max-w-2xl`); the public and marketing pages stretch to **1200px**. Static pages read in a centred **68ch** text column.
- **Grid view** is a centred set of cards up to 210px wide: 2 columns on phones, 3 from 640px, 4 from 1024px, with 16px gutters widening to 40px from 768px, inside a 960px frame. Cards are laid out as a masonry so short cards move up and near-level columns read left to right.
- **Vertical rhythm** inside lists comes from day groups: a 12px muted label above each day's rows, groups 32px apart. The grid is not split by day; each day's label rides above its first card.
- **16px page gutter** at every size; 24px padding inside dialogs; 12px inside cards on phones and 16px from md.
- **Fixed chrome, scrolling content.** The header is pinned to the top and fades from page background to transparent; the search field, selection bar and shared-folder footer are pinned to the bottom above the safe area and the on-screen keyboard (`--bottom-inset`). Toasts stack above them.
- **Alignment on one axis.** The landing hero is left-aligned to the product panel's left edge (both use a 6% side padding from md), so the headline, buttons and the demo start on one line.
- **Touch adapts, mouse stays compact.** Under a coarse pointer, controls grow to 40px with an invisible 2px extension (44px targets), row heights go to 56px and text to 16px; mouse users keep the 32px bar and 14px text. Hover-revealed controls (row menus, checkboxes, card actions) are always visible on touch.
- **Whitespace is the hierarchy.** Sections are separated by space and tone (muted labels, hairlines), never by filled bands or heavy rules.
- **Motion budget:** entering content fades and un-blurs over 200ms on `cubic-bezier(0.23, 1, 0.32, 1)`; groups stagger 40ms apart (first 8 items); layout moves use 250–300ms springs or FLIP transitions; menus and dialogs animate in 100ms. Reduced motion keeps the fades and removes everything else.
