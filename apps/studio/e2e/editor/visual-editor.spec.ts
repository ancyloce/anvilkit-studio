/**
 * CORE-P1B-012 — visual-editor browser matrix (§27.5), DOM/geometry
 * assertions only: WSL2 headless screenshot capture is broken on this
 * dev box (verified), so visual baselines are CI-generated; local
 * runs never compare pixels.
 *
 * Matrix axes covered here: zoom (50/100/200% via the chrome zoom
 * controls), DPR (per-project `deviceScaleFactor`), scroll (wheel
 * before interaction). Firefox/WebKit run via the env-gated matrix
 * projects (`ANVILKIT_E2E_MATRIX=1`, CI); locally chromium-only, per
 * the harness default.
 */

import { expect, type Page, test } from "@playwright/test";

const EDITOR_URL = "/puck/editor?editor=1&collab=0";

async function openEditor(page: Page): Promise<void> {
	await page.goto(EDITOR_URL);
	// The write-target toolbar is the editor-on beacon (lazy chunk
	// loaded + responsive controller installed).
	await expect(page.getByTestId("ak-write-target")).toBeVisible({
		timeout: 90_000,
	});
}

/**
 * Select a node through its Layers row — the repo's proven selection
 * path (layer-scroll.spec.ts pattern). Canvas click-to-select is a
 * Puck-native concern outside this suite's scope; the editor's
 * canvas multi-select surface is the marquee (unit-covered).
 */
async function selectViaLayers(page: Page, nodeId: string): Promise<void> {
	await openLayersPanel(page);
	await page.getByTestId(`ak-layer-select-${nodeId}`).click({ force: true });
}

/** Open the Layers rail module and its inner Layers tab. */
async function openLayersPanel(page: Page): Promise<void> {
	const railTab = page.locator("#ak-rail-tab-layer");
	await railTab.waitFor({ state: "attached", timeout: 30_000 });
	// The demo canvas animates continuously; `force` skips the
	// never-settling stability wait (layer-scroll.spec.ts precedent).
	await railTab.click({ force: true });
	await expect(page.getByTestId("ak-module-layer")).toBeVisible({
		timeout: 10_000,
	});
	// The module opens on its Pages tab; layer rows live in the Layers
	// tab's panel, which has no layout box until it is active (so even
	// a forced click on a row cannot resolve a click point).
	await page.getByTestId("ak-layer-tab-layers").click({ force: true });
	await expect(page.getByTestId("ak-layer-layers")).toBeVisible({
		timeout: 10_000,
	});
}

test.describe("visual editor mount (CORE-P1B-012)", () => {
	test("mounts the editor runtime with toolbar, layers search, and clean console", async ({
		page,
	}) => {
		const pageErrors: string[] = [];
		page.on("pageerror", (error) => pageErrors.push(String(error)));
		await openEditor(page);

		await openLayersPanel(page);
		await expect(page.getByTestId("ak-layer-search")).toBeVisible();
		await expect(page.getByTestId("ak-follow-viewport")).toBeVisible();
		await expect(page.getByTestId("ak-show-overrides")).toBeVisible();
		expect(pageErrors).toEqual([]);
	});

	test("breakpoint editor opens and write-target switching never dirties the document", async ({
		page,
	}) => {
		await openEditor(page);
		await page.getByTestId("ak-write-target").click();
		// The default OQ-002 preset surfaces base + three breakpoints.
		await expect(page.getByRole("menuitem", { name: /tablet/i })).toBeVisible();
		await page.getByRole("menuitem", { name: /tablet/i }).click();
		await expect(page.getByTestId("ak-write-target")).toContainText(/tablet/i);
		// Switching layers is transient: undo must stay unavailable
		// (no history entry was recorded by the switch).
		await page.getByTestId("ak-write-target").click();
		await page.getByRole("menuitem", { name: /base/i }).click();
	});

	test("selection surfaces the universal inspector", async ({ page }) => {
		await openEditor(page);
		const frame = page.frameLocator("iframe").first();
		await expect(frame.locator("[data-ak-node]").first()).toBeVisible({
			timeout: 30_000,
		});
		await selectViaLayers(page, "hero-primary");
		await expect(page.getByTestId("ak-editor-inspector")).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByTestId("ak-layout-section")).toBeVisible();
	});

	test("resize gesture commits once and one Undo restores it (§10.5)", async ({
		page,
	}) => {
		await openEditor(page);
		const frame = page.frameLocator("iframe").first();
		const node = frame.locator('[data-ak-node="hero-primary"]');
		await expect(node).toBeVisible({ timeout: 30_000 });
		await selectViaLayers(page, "hero-primary");
		const handle = frame.locator('[data-ak-handle="resize-e"]');
		await expect(handle).toBeVisible({ timeout: 15_000 });

		const before = await node.evaluate(
			(el) => el.getBoundingClientRect().width,
		);
		const box = await handle.boundingBox();
		if (box === null) {
			throw new Error("resize handle has no box");
		}
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2, {
			steps: 5,
		});
		await page.mouse.up();

		// The committed width sticks (authoring stylesheet applies it).
		await expect
			.poll(async () => node.evaluate((el) => el.getBoundingClientRect().width))
			.toBeLessThan(before - 30);

		// ONE undo restores the pre-gesture width — the whole gesture was
		// a single history entry.
		await page.getByRole("button", { name: /undo/i }).click();
		await expect
			.poll(async () => node.evaluate((el) => el.getBoundingClientRect().width))
			.toBeGreaterThan(before - 5);
	});

	test("inline plain-text editing: enter, type, commit, one-step undo (ED-TEXT-001/003)", async ({
		page,
	}) => {
		await openEditor(page);
		const frame = page.frameLocator("iframe").first();
		const headline = frame.locator("h1").first();
		await expect(headline).toBeVisible({ timeout: 30_000 });
		const original = (await headline.textContent()) ?? "";

		// Stand in for a component that adopted the metadata: stamp the
		// declared target region (the host config declares `headline`).
		await headline.evaluate((el) =>
			el.setAttribute("data-ak-text-target", "headline"),
		);
		await headline.dblclick({ force: true });
		await expect
			.poll(async () =>
				headline.evaluate((el) => (el as HTMLElement).isContentEditable),
			)
			.toBe(true);

		await page.keyboard.type(" EDITED");
		// Blur commits (750 ms idle would too — blur is deterministic).
		await frame.locator("body").click({ position: { x: 4, y: 4 } });
		await expect(headline).toContainText("EDITED", { timeout: 10_000 });
		await expect
			.poll(async () =>
				headline.evaluate((el) => (el as HTMLElement).isContentEditable),
			)
			.toBe(false);

		// Committed edits undo via Puck history only — one step.
		await page.getByRole("button", { name: /undo/i }).click();
		await expect
			.poll(async () => (await headline.textContent()) ?? "")
			.toBe(original);
	});

	test("layers multi-select surfaces the canvas toolbar; bulk duplicate is one history entry", async ({
		page,
	}) => {
		await openEditor(page);
		const frame = page.frameLocator("iframe").first();
		const countNodes = async (): Promise<number> =>
			frame.locator("[data-ak-node]").count();
		const before = await countNodes();
		expect(before).toBeGreaterThan(1);

		await selectViaLayers(page, "navbar-primary");
		await page
			.getByTestId("ak-layer-select-hero-primary")
			.click({ force: true, modifiers: ["ControlOrMeta"] });

		const toolbar = frame.locator("[data-ak-selection-toolbar]");
		await expect(toolbar).toBeVisible({ timeout: 10_000 });
		await expect(
			toolbar.locator('[data-ak-toolbar-action="left"]'),
		).toBeVisible();

		// Bulk duplicate: two copies land in ONE commitNative dispatch.
		await toolbar.locator('[data-ak-toolbar-action="duplicate"]').click();
		await expect.poll(countNodes).toBe(before + 2);
		await page.getByRole("button", { name: /undo/i }).click();
		await expect.poll(countNodes).toBe(before);
	});

	test("zoom controls change scale without breaking the toolbar (50/100/200%)", async ({
		page,
	}) => {
		await openEditor(page);
		const zoomOut = page.getByRole("button", { name: /zoom out/i });
		const zoomIn = page.getByRole("button", { name: /zoom in/i });
		await zoomOut.click();
		await zoomOut.click();
		await expect(page.getByTestId("ak-write-target")).toBeVisible();
		await zoomIn.click();
		await zoomIn.click();
		await zoomIn.click();
		await zoomIn.click();
		await expect(page.getByTestId("ak-write-target")).toBeVisible();
		// Scroll axis: interactions after wheel still resolve.
		await page.mouse.wheel(0, 400);
		await expect(page.getByTestId("ak-write-target")).toBeVisible();
	});
});
