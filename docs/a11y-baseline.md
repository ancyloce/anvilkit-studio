# Accessibility Baseline (WCAG 2.1 AA)

**Last updated:** 2026-05-23
**Target standard:** [WCAG 2.1 Level AA](https://www.w3.org/WAI/WCAG21/quickref/)
**Scope:** All 11 published `@anvilkit/*` component packages in `packages/components/src/`, plus the Canvas Studio editor chrome in `@anvilkit/canvas-editor` (added 2026-05-23, plan I3-3 — see [§Canvas Studio editor](#canvas-studio-editor-anvilkitcanvas-editor)).
**Task:** `phase35-007` (ticket not retained)

## Summary

All 11 components currently ship at **WCAG 2.1 AA smoke pass** — no serious or critical semantic or keyboard violations found in manual review of each component's source. Four components ship background or text animations without respecting `prefers-reduced-motion`; this is the only systemic gap and is tracked as a follow-up (see §Known gaps).

## How this baseline was produced

Two complementary methods:

1. **Automated smoke test** — [`apps/studio/e2e/a11y.spec.ts`](../apps/studio/e2e/a11y.spec.ts) runs axe-core against the demo home page. It exists to prove the a11y tooling pipeline (Playwright + axe injection + violation reporting + CI wiring) works end-to-end. It does **not** scan every component — see "Why not full-page axe scan" below.
2. **Manual source review** — each component's `.tsx` was read against the WCAG 2.1 AA criteria in the matrix below. The repo ships small, stateless render adapters on top of `@anvilkit/ui` primitives (which wrap Radix / shadcn), so source review is load-bearing and sufficient to produce per-criterion verdicts.

### Why not a full-page axe scan

The `/puck/render` route composes all 11 components plus persistent animations (FlickeringGrid, Ripple, RainbowButton, Aurora text, shimmer text, marquee). In a WSL2 / CI Chromium sandbox, `axe.run()`'s `color-contrast` rule alone exceeds 5 minutes on that page — the rule performs async canvas-based sampling per text node, and the animated backgrounds prevent the page from reaching a stable paint. We also observed timeouts on the simple home page until `color-contrast` was disabled.

The smoke test therefore runs against the home page with `color-contrast` disabled. Color-contrast verdicts in the matrix below come from reading the Tailwind token usage in each component (all components consume `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`, etc. from `@anvilkit/tailwind-config/shadcn` — the token palette is designed to meet WCAG AA in both themes).

## Per-component matrix

Legend — `✅` pass, `➖` N/A (component has no controls of this type), `⚠️` gap to address, `?` not verified (see notes).

| Component | Semantic HTML | Keyboard nav | Focus visible | Color contrast | ARIA | No color-only | SR announcements | Overall |
|---|---|---|---|---|---|---|---|---|
| `@anvilkit/button` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Pass** |
| `@anvilkit/input` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Pass** |
| `@anvilkit/navbar` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Pass** |
| `@anvilkit/hero` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Pass** |
| `@anvilkit/pricing-minimal` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Pass** |
| `@anvilkit/bento-grid` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Pass** |
| `@anvilkit/section` | ✅ | ➖ | ➖ | ✅ | ✅ | ✅ | ✅ | **Pass**¹ |
| `@anvilkit/statistics` | ✅ | ➖ | ➖ | ✅ | ✅ | ✅ | ✅ | **Pass**¹ |
| `@anvilkit/blog-list` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Pass** |
| `@anvilkit/helps` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Pass**¹ |
| `@anvilkit/logo-clouds` | ✅ | ➖ | ➖ | ✅ | ✅ | ✅ | ✅ | **Pass**¹ |

¹ Ships visual animations without `prefers-reduced-motion` handling. Not a WCAG AA failure (2.2.2 "Pause, Stop, Hide" applies to moving content longer than 5 s — most animations here are decorative and the user can pause Marquee by interacting; however, 2.3.3 "Animation from Interactions" is AAA). Tracked as a follow-up; see Known gaps.

## Per-component notes

### `@anvilkit/button`
[`src/button/src/Button.tsx`](../packages/extensions/components/src/button/src/Button.tsx)

- Renders a real `<a>` when `href` is provided, real `<button>` otherwise — no `<div>` buttons.
- Inactive state sets `aria-disabled`, `tabIndex={-1}`, and removes the anchor `href`. Screen readers announce "dimmed"; keyboard skips the control.
- External links set `target="_blank"` + `rel="noreferrer noopener"`.
- Contrast: inherits shadcn `primary` / `outline` button variants, both tuned to WCAG AA in both themes.

### `@anvilkit/input`
[`src/input/src/Input.tsx`](../packages/extensions/components/src/input/src/Input.tsx)

- `<label>` **wraps** the input — implicit labeling, no `for`/`id` plumbing needed.
- `required` attr propagates to the DOM so screen readers announce "required". The visible `*` in the label is cosmetic reinforcement.
- `disabled` and `editMode` both disable the input (with `aria-disabled` mirror) and downgrade foreground/background tokens.
- **Minor gap:** `helperText` is a sibling `<span>` and is not wired to the input via `aria-describedby`. Screen readers will read it because the `<label>` contains both, but a follow-up could make the association explicit. Not a WCAG AA failure.

### `@anvilkit/navbar`
[`src/navbar/src/Navbar.tsx`](../packages/extensions/components/src/navbar/src/Navbar.tsx)

- Root is `<nav aria-label="Primary">`. Menu is a real `<ul>` / `<li>` list.
- Mobile toggle is a real `<button>` with `aria-controls`, `aria-expanded`, and a `<span class="sr-only">` label that flips between "Open navigation menu" / "Close navigation menu".
- Active item uses `aria-current="page"`.
- Desktop hover highlight is **mirrored on focus** (both `onMouseEnter`/`onMouseLeave` and `onFocus`/`onBlur` update the highlighted item), so keyboard users see the same affordance as mouse users — avoids SC 1.4.13 regressions.
- Chevron and toggle icons are `aria-hidden="true"` with adjacent text labels.
- Edit mode neutralizes interactivity: anchors drop `href`, `preventDefault` swallows clicks, `tabIndex={-1}` removes them from tab order.

### `@anvilkit/hero`
[`src/hero/src/Hero.tsx`](../packages/extensions/components/src/hero/src/Hero.tsx)

- `<section>` root, single `<h1>` per the page contract.
- Decorative backdrop is `aria-hidden="true"`.
- Download CTAs swap to real `<a>` when `href` is set, real `<button disabled>` otherwise. External targets set `rel="noreferrer noopener"`.
- **Reduced-motion note:** RainbowButton has a continuous rainbow effect. Decorative, no motion threshold trigger.

### `@anvilkit/pricing-minimal`
[`src/pricing-minimal/src/PricingMinimal.tsx`](../packages/extensions/components/src/pricing-minimal/src/PricingMinimal.tsx)

- `<section>` / `<h2>` / `<article>` / `<ul>` / `<li>` — all semantic.
- Check and Plus icons are `aria-hidden="true"`; the feature text is what SRs read.
- Featured state is communicated via both the `badgeLabel` text and a visual style — not color-alone.
- Inactive CTA renders as a disabled `<button>`, not a dead link.

### `@anvilkit/bento-grid`
[`src/bento-grid/src/BentoGrid.tsx`](../packages/extensions/components/src/bento-grid/src/BentoGrid.tsx)

- `<section>` root, `<h2>` per card. Card heading level is a design choice driven by where the grid sits in the page; consumers embedding the grid under an `<h1>` get a valid outline.
- All `lucide-react` icons are `aria-hidden="true"`.
- Inactive CTA renders as a `<span aria-disabled="true">` instead of a dead link — prevents screen-reader link enumeration from listing non-functional "learn more" anchors. Acceptable, though a disabled `<button>` would be more conventional.

### `@anvilkit/section`
[`src/section/src/Section.tsx`](../packages/extensions/components/src/section/src/Section.tsx)

- Non-interactive landmark — no tab stops, no focus state to verify.
- `<h2>` heading; emoji is wrapped in `<span aria-hidden="true">` so screen readers don't read "sparkles".
- AnimatedShinyText and AuroraText are decorative visual effects — the underlying text is readable as DOM text; SRs announce the content without the animation.

### `@anvilkit/statistics`
[`src/statistics/src/Statistics.tsx`](../packages/extensions/components/src/statistics/src/Statistics.tsx)

- Non-interactive. `<section>` / `<h2>`.
- FlickeringGrid canvas background is `aria-hidden="true"` and `pointer-events-none`.
- **Reduced-motion note:** flicker animation runs continuously. See Known gaps.

### `@anvilkit/blog-list`
[`src/blog-list/src/BlogList.tsx`](../packages/extensions/components/src/blog-list/src/BlogList.tsx)

- `<section>` grid of interactive `<a>` cards (or `<div>` cards when `href` is absent).
- Each card has an `<h3>` title, `<time datetime="…">`, and an `<img alt="…">`. No decorative-only images.
- Interactive cards expose `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` — explicit keyboard focus ring.
- External links set `rel="noreferrer noopener"`.
- Empty-state fallback uses sentence text, not an icon, so the message is readable by SRs.

### `@anvilkit/helps`
[`src/helps/src/Helps.tsx`](../packages/extensions/components/src/helps/src/Helps.tsx)

- `<section>` root. Ripple canvas effect is `aria-hidden="true"`.
- Avatars render `<img alt={name}>` when a photo is supplied, or an initials fallback.
- CTA is real `<a>` / disabled `<button>` depending on `href` and edit mode. Git-pull-request icon is `aria-hidden="true"`.
- Avatar group tooltips expose contributor names to assistive tech.
- **Reduced-motion note:** Ripple animation. See Known gaps.

### `@anvilkit/logo-clouds`
[`src/logo-clouds/src/LogoClouds.tsx`](../packages/extensions/components/src/logo-clouds/src/LogoClouds.tsx)

- Non-interactive. `<section>` root.
- Marquee wrapper has `aria-label="Brand logos"` so SRs describe the region.
- Gradient masks are `aria-hidden="true"`.
- Each `<img>` has a descriptive `alt` (`"${label} logo"`).
- Heading is rendered via `ShimmeringText` with `role="heading"` + `aria-level={2}` — programmatic heading semantics preserved despite the non-native element.
- **Reduced-motion note:** Marquee scrolls continuously. See Known gaps.

## Canvas Studio editor (`@anvilkit/canvas-editor`)

**Added:** 2026-05-23 (plan I3-3). **Scope:** the editor's interactive chrome — `ToolAnnouncer`, `PropertyInspector`, `LayerPanel`, `PageNavigator`. The Konva drawing surface itself is out of scope (see gap below).

### How this surface is verified

The axe smoke test only scans the demo home page, which does **not** mount the canvas editor (it loads behind `next/dynamic({ ssr: false })` on `/studio/canvas/*`). The editor's a11y is instead gated by **package-local Vitest assertions** that read the rendered ARIA tree:

- `src/a11y/__tests__/ToolAnnouncer.test.tsx` — live-region role + politeness + announcement updates.
- `src/panels/__tests__/PropertyInspector.test.tsx` — `role="region"` + per-input accessible names.
- `src/panels/__tests__/LayerPanel.test.tsx` — `role="tree"` / `treeitem` + focus-ring not suppressed.
- `src/pages/__tests__/PageNavigator.test.tsx` — `role="tablist"` / `tab` + `aria-selected`.

Run: `pnpm -C packages/canvas/editor run test`.

### Per-surface matrix

| Surface | Semantic HTML | Keyboard nav | Focus visible | Color contrast | ARIA | SR announcements | Overall |
|---|---|---|---|---|---|---|---|
| `ToolAnnouncer` | ✅ | ➖ | ➖ | ➖ | ✅ `role="status"`/`aria-live="polite"` | ✅ announces active tool | **Pass** |
| `PropertyInspector` | ✅ real `<input>` | ✅ native | ✅ native | ✅¹ | ✅ `role="region"`, every input `aria-label` | ✅ | **Pass** |
| `LayerPanel` | ✅ | ✅ Arrow/Delete/⌘G | ✅² | ✅¹ | ✅ `role="tree"`/`treeitem` + `aria-selected`, state-aware button labels | ✅ | **Pass** |
| `PageNavigator` | ✅ real `<button>` | ✅³ | ✅ native | ✅¹ | ✅ `role="tablist"`/`tab` + `aria-selected`, labeled action buttons | ✅ | **Pass** |

¹ Panel chrome uses hardcoded grays (`#374151` on `#ffffff`, selection `#1e3a8a` on `#dbeafe`) — all comfortably ≥ AA. **Not theme-aware** (no dark mode / shadcn tokens) — quality gap, not an AA failure (see Known gaps).
² I3-3 removed the inline `outline: "none"` on the focusable `LayerPanel` root so the UA focus ring renders (SC 2.4.7).
³ Page tabs are all keyboard-focusable via Tab; the full APG roving-tabindex + arrow-key tab widget is **not** implemented (see Known gaps).

### Verdict

Canvas Studio editor chrome ships at **WCAG 2.1 AA smoke pass** — no serious/critical keyboard or semantic violations in the four interactive surfaces. Gaps below are quality follow-ups, not AA failures.

## Known gaps

### `prefers-reduced-motion` not honored by decorative animations

Four components ship background or text animations that run without checking the user's motion preference:

- `@anvilkit/statistics` — FlickeringGrid canvas
- `@anvilkit/helps` — Ripple canvas
- `@anvilkit/logo-clouds` — Marquee horizontal scroll
- `@anvilkit/section` — AnimatedShinyText + AuroraText text effects
- (`@anvilkit/hero` — RainbowButton announcement)

WCAG 2.1 AA SC 2.2.2 ("Pause, Stop, Hide") applies to content that moves longer than 5 seconds and is presented in parallel with other content; these animations are decorative and largely background-layer (`pointer-events-none`, `aria-hidden`), so they do not block SR consumption. SC 2.3.3 ("Animation from Interactions") is **AAA**, not AA.

This is **not** a WCAG AA failure, but it is a quality gap worth closing before authoring guides cite these components as reference implementations. Follow-up tracked inline (no separate GitHub issue yet — noted here so the Phase 4 authoring guide can cite the expected fix).

**Recommended fix pattern** (for future component work):

```css
@media (prefers-reduced-motion: reduce) {
  .anvilkit-statistics__grid,
  .anvilkit-helps__ripple,
  .anvilkit-logo-clouds__marquee {
    animation: none;
  }
}
```

### Canvas Studio editor follow-ups (`@anvilkit/canvas-editor`)

None of these are WCAG 2.1 AA failures; they are quality gaps to close before the Canvas Studio docs cite the editor as a reference surface:

- **Konva drawing surface is not in the a11y tree.** The stage renders to a single `<canvas>`; individual nodes are not screen-reader navigable. The **`LayerPanel`** (a labeled `role="tree"` with `treeitem` rows + keyboard nav) is the intended accessible alternative for selecting/inspecting nodes — this is the standard accessible-alternative pattern for canvas editors, but the limitation should be documented for consumers.
- **No i18n.** Every editor string and ARIA label is hardcoded English (matches the package's existing state — there is no i18n message system in `canvas-editor` yet). Threading the repo's i18n message-key convention through the editor is a separate follow-up; I3-3 deliberately kept new ARIA strings hardcoded English to match surrounding code rather than introduce i18n infra under an a11y task.
- **Panel chrome is not theme-aware.** `LayerPanel` / `PropertyInspector` / `PageNavigator` use hardcoded hex grays via inline styles (the iframe-styling caveat means Tailwind tokens don't reach these surfaces). Contrast meets AA in the light palette, but there is no dark-mode variant. A follow-up should route panel colors through a theme-aware token seam.
- **`PageNavigator` tab widget is partial.** Tabs expose `role="tab"`/`aria-selected` inside a `role="tablist"` and are individually Tab-focusable, but the full APG pattern (roving `tabindex`, Left/Right arrow navigation, `aria-controls` → tabpanel) is not implemented.
- **`ToolAnnouncer` only mounts inside `<CanvasStudio>`.** Hosts that mount `LayerPanel`/`PropertyInspector` standalone (outside the `<CanvasStudio>` tree) do not get the live region. Document that the announcer travels with `<CanvasStudio>`, or expose it for standalone composition.

## Running the a11y smoke test

```bash
cd apps/studio
pnpm exec playwright test e2e/a11y.spec.ts --reporter=list
```

The test fails only on **serious** or **critical** axe violations; other impacts are logged for visibility but do not block CI.

## Re-verification checklist (quarterly)

When revisiting this baseline:

- [ ] Re-run `pnpm --filter studio e2e` — all tests green.
- [ ] Spot-check each component with the browser DevTools accessibility tree + a screen reader (VoiceOver / NVDA) on at least one page that embeds it.
- [ ] Verify color contrast in both themes using DevTools' contrast checker on the sample text in the demo.
- [ ] Check for new components added under `packages/components/src/` since the last review and add a matrix row.
- [ ] Re-run `pnpm -C packages/canvas/editor run test` — the canvas-editor a11y assertions (ToolAnnouncer / PropertyInspector / LayerPanel / PageNavigator) stay green.
- [ ] Re-read this file against the current WCAG 2.1 AA quickref — errata are published periodically.

## References

- [WCAG 2.1 quickref](https://www.w3.org/WAI/WCAG21/quickref/)
- [axe-core rules](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
- `phase35-007` task spec (ticket not retained)
- [Playwright a11y test source](../apps/studio/e2e/a11y.spec.ts)
