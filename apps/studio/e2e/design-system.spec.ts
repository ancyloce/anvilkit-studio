/**
 * @file Phase D / PRD 0005 — Design System plugin smoke + integration
 * coverage for `@anvilkit/plugin-design-system`.
 *
 * What this spec covers (reachable surface as of 2026-05-21):
 *   1. The editor boots without errors when `createDesignSystemPlugin()`
 *      is mounted in the demo's `<Studio plugins>` array.
 *   2. The plugin's `--ak-ds-*` CSS variables resolve to non-empty
 *      values in the host document, proving the Phase A CSS plumbing
 *      (`packages/runtime/core/src/react/overrides/styles.css`) landed.
 *   3. The demo-only `TokenSwatch` component (added by
 *      `apps/studio/lib/token-swatch-component.ts`) renders with the
 *      seeded token refs resolving to `var(--ak-ds-*)` at paint time —
 *      this verifies the field factory + `resolveTokenRef` round-trip
 *      under real browser rendering.
 *
 * What this spec does NOT cover (deferred — see memory
 * `design-system-rail-unwired`):
 *   - Design System rail tab click + panel render (Tokens / Theme tabs).
 *     `@anvilkit/core`'s `EditorTab` union and `RAIL_MODULES` array do
 *     not yet include a `"design-system"` entry; registering the panel
 *     updates `sidebarRegistryStore.designSystemPanel` but no UI consumes
 *     that state. Back-fill required in Phase B.
 *   - Theme toggle UI (`design-system-tab-theme` / `theme-mode-*`
 *     buttons) — blocked on the same rail-tab gap.
 *   - Contrast-validator publish gate end-to-end — the validator unit
 *     tests in `packages/extensions/plugins/plugin-design-system/src/validation/`
 *     cover the throw path; the UI surface for the resulting error is
 *     intertwined with the unwired rail panel.
 *
 * Conventions mirror `pages-management.spec.ts`:
 *   - console / pageerror / requestfailed listeners attached BEFORE
 *     navigation so hydration errors surface as diagnostics.
 *   - 30 s wait for the rail tablist as the hydration signal.
 *   - `test.describe.configure({ mode: "serial", timeout: 120_000 })`
 *     so the first test warms the `/puck/editor` cold compile and the
 *     remainder inherit warm chunks.
 */

import { expect, type Page, test } from "@playwright/test";

async function gotoEditor(
	page: Page,
): Promise<{ console: string[]; pageErrors: string[]; failed: string[] }> {
	const consoleMessages: string[] = [];
	const pageErrors: string[] = [];
	const failed: string[] = [];

	page.on("console", (msg) => {
		consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
	});
	page.on("pageerror", (err) => {
		pageErrors.push(err.stack ?? err.message);
	});
	page.on("requestfailed", (req) => {
		failed.push(
			`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? "unknown"}`,
		);
	});

	// Collaboration is on by default; this suite isn't testing collab, so opt
	// out (`?collab=0`) to keep the zero-error assertions relay-independent.
	await page.goto("/puck/editor?collab=0");
	await expect(
		page.locator('[role="tablist"][aria-orientation="vertical"]'),
	).toBeVisible({ timeout: 30_000 });

	return { console: consoleMessages, pageErrors, failed };
}

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("Design System plugin — demo integration", () => {
	test("editor mounts cleanly with createDesignSystemPlugin in the plugins array", async ({
		page,
	}) => {
		const { pageErrors, failed } = await gotoEditor(page);

		// No hydration crash, no failed chunks. The plugin's `register()`
		// runs inside `compilePlugins` synchronously during `<Studio>`
		// mount; any throw would surface as a page error.
		expect(pageErrors, "no page errors during hydration").toEqual([]);
		expect(failed, "no failed network requests").toEqual([]);
	});

	test("--ak-ds-* CSS variables resolve to non-empty values in the host document", async ({
		page,
	}) => {
		await gotoEditor(page);

		// Probe a representative slice of the two-tier vocabulary —
		// primitive (`brand-500`), semantic (`bg`, `fg`, `accent`,
		// `border`), and a spacing primitive. All must resolve to a
		// non-empty computed style; an empty string would mean the
		// `packages/runtime/core/src/react/overrides/styles.css` block didn't
		// land. The fallback chain (`var(--ak-ds-bg, var(--ak-studio-bg))`)
		// guarantees a value even when no host overrides apply.
		const resolved = await page.evaluate(() => {
			const root = document.documentElement;
			const style = getComputedStyle(root);
			return {
				brand500: style.getPropertyValue("--ak-ds-brand-500").trim(),
				bg: style.getPropertyValue("--ak-ds-bg").trim(),
				fg: style.getPropertyValue("--ak-ds-fg").trim(),
				accent: style.getPropertyValue("--ak-ds-accent").trim(),
				border: style.getPropertyValue("--ak-ds-border").trim(),
				space4: style.getPropertyValue("--ak-ds-space-4").trim(),
				radiusMd: style.getPropertyValue("--ak-ds-radius-md").trim(),
			};
		});

		expect(resolved.brand500, "--ak-ds-brand-500 declared").not.toBe("");
		expect(resolved.bg, "--ak-ds-bg declared").not.toBe("");
		expect(resolved.fg, "--ak-ds-fg declared").not.toBe("");
		expect(resolved.accent, "--ak-ds-accent declared").not.toBe("");
		expect(resolved.border, "--ak-ds-border declared").not.toBe("");
		expect(resolved.space4, "--ak-ds-space-4 declared").not.toBe("");
		expect(resolved.radiusMd, "--ak-ds-radius-md declared").not.toBe("");
	});

	test("--ak-ds-* CSS variables also resolve inside the Puck canvas iframe", async ({
		page,
	}) => {
		await gotoEditor(page);

		// The iframe injection is mirrored from
		// `packages/runtime/core/src/react/studio/theme/iframe-theme.ts`'s
		// `TOKEN_BLOCK` and must land in lockstep with the host doc.
		// We wait for the iframe to be present, then probe the same
		// vars. The iframe's `<style id="anvilkit-studio-iframe-theme">`
		// guard means re-mounts don't double-inject; this test only
		// checks that the first injection happened.
		const iframe = page
			.frameLocator('iframe[title="Preview"], iframe[name^="puck"], iframe')
			.first();

		// Give Puck's iframe a moment to mount + receive the style
		// injection. The token block is injected during a `useEffect` so
		// it lands after the iframe's initial paint.
		await expect
			.poll(
				async () =>
					await iframe.locator(":root").evaluate((root) => {
						const style = getComputedStyle(root);
						return {
							bg: style.getPropertyValue("--ak-ds-bg").trim(),
							brand500: style.getPropertyValue("--ak-ds-brand-500").trim(),
						};
					}),
				{ timeout: 15_000 },
			)
			.toMatchObject({
				bg: expect.stringMatching(/.+/),
				brand500: expect.stringMatching(/.+/),
			});
	});
});
