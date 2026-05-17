/**
 * @file E2E — clicking a layer scrolls the canvas iframe to that
 * component.
 *
 * Exercises `LayerRow.select()` →
 * `useScrollComponentIntoView()` in the real demo editor. The demo
 * seeds a tall Home page (11 components), so at least one seeded
 * component sits below the canvas fold. The spec:
 *
 *   1. Opens `/puck/editor`, switches to the Layer module.
 *   2. Resets the preview iframe scroll to the top.
 *   3. Finds a layer whose rendered component (`[data-puck-component]`)
 *      is NOT in the iframe viewport at scrollTop 0.
 *   4. Clicks that layer row's label.
 *   5. Asserts the iframe scrolled (scrollTop increased) AND the
 *      component is now within the iframe viewport.
 *
 * Puck hardcodes the canvas iframe id `preview-frame` and tags every
 * rendered component with `data-puck-component="<id>"` — the same
 * attribute the scroll hook queries. Conventions match
 * `apps/demo/e2e/sidebar-modules.spec.ts`.
 */

import { type Frame, type Page, expect, test } from "@playwright/test";

const RAIL_TAB_LAYER = "ak-rail-tab-layer";
const MODULE_LAYER = "ak-module-layer";

async function gotoLayerModule(page: Page): Promise<void> {
	const pageErrors: string[] = [];
	page.on("pageerror", (err) => {
		pageErrors.push(err.stack ?? err.message);
	});

	await page.goto("/puck/editor");
	await expect(
		page.locator('[role="tablist"][aria-orientation="vertical"]'),
	).toBeVisible({ timeout: 30_000 });

	await page.locator(`#${RAIL_TAB_LAYER}`).click();
	await expect(page.getByTestId(MODULE_LAYER)).toBeVisible({
		timeout: 5_000,
	});

	expect(pageErrors, pageErrors.join("\n")).toEqual([]);
}

async function previewFrame(page: Page): Promise<Frame> {
	const handle = await page
		.locator("iframe#preview-frame")
		.elementHandle({ timeout: 15_000 });
	expect(handle, "preview iframe handle").not.toBeNull();
	const frame = await handle?.contentFrame();
	expect(frame, "preview iframe contentFrame").not.toBeNull();
	return frame as Frame;
}

function scrollTopOf(frame: Frame): Promise<number> {
	return frame.evaluate(() => {
		const se = document.scrollingElement ?? document.documentElement;
		return se.scrollTop;
	});
}

test("clicking a layer scrolls the canvas iframe to the component", async ({
	page,
}) => {
	test.setTimeout(120_000);
	await gotoLayerModule(page);

	// The draggable layer tree renders one row per seeded component.
	const tree = page.getByTestId("ak-layer-tree");
	await expect(tree).toBeVisible({ timeout: 10_000 });

	const ids = await page
		.locator('[data-testid^="ak-layer-node-"]')
		.evaluateAll((els) =>
			els
				.map((el) => el.getAttribute("data-testid") ?? "")
				.map((tid) => tid.replace("ak-layer-node-", ""))
				.filter((id) => id.length > 0),
		);
	expect(ids.length, "seeded layer rows").toBeGreaterThan(0);

	const frame = await previewFrame(page);

	// Reset the canvas to the top so "below the fold" is well defined.
	await frame.evaluate(() => {
		const se = document.scrollingElement ?? document.documentElement;
		se.scrollTop = 0;
	});
	await expect.poll(() => scrollTopOf(frame)).toBe(0);

	// Pick a layer whose component is NOT visible at scrollTop 0.
	let targetId: string | null = null;
	for (const id of ids) {
		const visibleAtTop = await frame.evaluate((sel) => {
			const el = document.querySelector(sel);
			if (el === null) return null;
			const r = el.getBoundingClientRect();
			return r.top < window.innerHeight && r.bottom > 0;
		}, `[data-puck-component="${id}"]`);
		// `null` → component not rendered with the attribute; skip it.
		if (visibleAtTop === false) {
			targetId = id;
			break;
		}
	}

	expect(
		targetId,
		"a seeded component below the canvas fold (page tall enough to scroll)",
	).not.toBeNull();
	const id = targetId as string;

	await page.getByTestId(`ak-layer-select-${id}`).click();

	// The hook calls scrollIntoView({ behavior: "smooth" }) — poll
	// while the animation settles.
	await expect
		.poll(() => scrollTopOf(frame), {
			timeout: 5_000,
			message: "iframe should scroll down to reveal the clicked layer",
		})
		.toBeGreaterThan(0);

	await expect
		.poll(
			() =>
				frame.evaluate((sel) => {
					const el = document.querySelector(sel);
					if (el === null) return false;
					const r = el.getBoundingClientRect();
					return r.top < window.innerHeight && r.bottom > 0;
				}, `[data-puck-component="${id}"]`),
			{
				timeout: 5_000,
				message: "clicked layer's component should be in the iframe viewport",
			},
		)
		.toBe(true);
});
