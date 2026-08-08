import { expect, type Page, test } from "@playwright/test";

/**
 * canvas-m0-009 smoke — the Templates dock panel lists the
 * `@anvilkit/canvas-templates` catalog and loads a template into the current
 * document as ONE undo entry.
 *
 * DOM-driven throughout (dock tabs, panel buttons, and the host's
 * machine-readable `canvas-ir-debug` readout) — no on-canvas pointer
 * interaction, so it runs despite the react-konva/Next 16 Stage limitation
 * documented in `editor-core.spec.ts`.
 */
// File-wide timeout only. `mode: "serial"` is declared per-describe (cp3-006):
// it used to sit here, which made the canvas-m0-009 smoke a hard gate on every
// later describe in the file — one failure there SKIPPED the tag-search suite
// entirely and reported it as "did not run". The smoke keeps serial mode
// (its steps share one document); the tag suite does not need it, since each
// of its tests navigates to its own page id.
test.describe.configure({ timeout: 120_000 });

async function gotoCanvas(page: Page, pageId: string): Promise<void> {
	await page.goto(`/studio/canvas/${pageId}`);
	await expect(page.getByTestId("canvas-studio-mount")).toBeVisible({
		timeout: 30_000,
	});
	await expect(page.getByTestId("canvas-workspace-root")).toBeVisible({
		timeout: 30_000,
	});
}

async function nodeCount(page: Page): Promise<number> {
	return Number(await page.getByTestId("canvas-node-count").innerText());
}

test.describe("Canvas Studio — Templates panel (canvas-m0-009)", () => {
	test.describe.configure({ mode: "serial" });

	test("lists the catalog, loads a template after confirm, undo restores", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-templates-${Date.now()}`);
		const before = await nodeCount(page);

		// Open the Templates dock tab and pick the poster starter.
		await page.getByTestId("panel-dock-templates").click();
		await expect(page.getByTestId("templates-panel")).toBeVisible();
		await page.getByTestId("template-item-poster").click();
		await expect(page.getByTestId("template-confirm-poster")).toBeVisible();
		await page.getByTestId("template-load-poster").click();

		// The poster template's nodes replace the blank page's content.
		await expect
			.poll(async () => nodeCount(page), { timeout: 15_000 })
			.toBeGreaterThan(before);

		// One undo restores the pre-template document (single batch entry).
		//
		// `dispatchEvent`, not `click` (cp3-006). The `host-*` buttons live in the
		// demo's `sr-only` scripted-command slot and the full-bleed editor shell
		// (`canvas-studio-mount`) renders OVER them, so a real pointer click — even
		// a forced one — is delivered to the shell, never the button. Verified here
		// on a page where the Templates panel was never opened: `elementFromPoint`
		// at the button's centre resolves to `<main data-testid="canvas-studio-mount">`
		// and `.click()` times out. `editor-core.spec.ts:219-231` already documents
		// this and drives every `host-*` control the same way; this spec was the
		// straggler still using `.click()`.
		await page.getByTestId("host-undo").dispatchEvent("click");
		await expect
			.poll(async () => nodeCount(page), { timeout: 15_000 })
			.toBe(before);
	});
});

/**
 * cp3-006 — tag discovery against the REAL `@anvilkit/canvas-templates`
 * catalog, which is what makes this worth an E2E: the tags asserted here are
 * the shipped ones, so a catalog change that guts a tag fails here even though
 * every unit test (which builds its own fixtures) stays green.
 *
 * Uses `business-card` and its `networking` tag deliberately — "networking"
 * appears in no template title and no description, so a hit can only have come
 * from tag matching.
 */
test.describe("Canvas Studio — Templates tag search (cp3-006)", () => {
	test("free-text search matches a tag that appears in no title or description", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-template-tags-${Date.now()}`);
		await page.getByTestId("panel-dock-templates").click();
		await expect(page.getByTestId("templates-panel")).toBeVisible();
		await expect(page.getByTestId("template-item-poster")).toBeVisible();

		await page.getByTestId("templates-search").fill("networking");

		await expect(page.getByTestId("template-item-business-card")).toBeVisible();
		await expect(page.getByTestId("template-item-poster")).toBeHidden();
		await expect(page.getByTestId("template-item-ig-post")).toBeHidden();
	});

	test("a tag chip filters the catalog and the active-tag row clears it", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-template-tags-${Date.now()}`);
		await page.getByTestId("panel-dock-templates").click();
		await expect(page.getByTestId("templates-panel")).toBeVisible();
		await expect(page.getByTestId("template-item-business-card")).toBeVisible();

		// Every shipped template carries an orientation tag; `poster` is portrait
		// and `business-card` is landscape, so the facet must keep one and drop
		// the other.
		await page.getByTestId("template-tag-poster-portrait").click();
		await expect(page.getByTestId("templates-active-tag")).toBeVisible();
		await expect(page.getByTestId("template-item-poster")).toBeVisible();
		await expect(page.getByTestId("template-item-ig-story")).toBeVisible();
		await expect(page.getByTestId("template-item-business-card")).toBeHidden();
		await expect(
			page.getByTestId("template-tag-poster-portrait"),
		).toHaveAttribute("aria-pressed", "true");

		await page.getByTestId("templates-active-tag-clear").click();
		await expect(page.getByTestId("templates-active-tag")).toBeHidden();
		await expect(page.getByTestId("template-item-business-card")).toBeVisible();
	});

	test("the tag facet and the category facet narrow together", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-template-tags-${Date.now()}`);
		await page.getByTestId("panel-dock-templates").click();
		await expect(page.getByTestId("templates-panel")).toBeVisible();
		await expect(page.getByTestId("template-item-poster")).toBeVisible();

		// Tag alone: portrait spans the `social` poster/story and the `print` A4
		// flyer, so the result set crosses categories.
		await page.getByTestId("template-tag-poster-portrait").click();
		await expect(page.getByTestId("template-item-poster")).toBeVisible();
		await expect(page.getByTestId("template-item-a4-flyer")).toBeVisible();

		// Add `print`: the social portraits drop out, the print portrait stays.
		await page.getByTestId("templates-category-filter").click();
		await page.getByRole("option", { name: "print", exact: true }).click();

		await expect(page.getByTestId("template-item-a4-flyer")).toBeVisible();
		await expect(page.getByTestId("template-item-poster")).toBeHidden();
		await expect(page.getByTestId("template-item-ig-story")).toBeHidden();
		// `business-card` is print but landscape — proves the tag half still applies.
		await expect(page.getByTestId("template-item-business-card")).toBeHidden();
	});
});
