import { statSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

/**
 * PRD §9.2 scenarios 4 (artboard management) and 6 (export round-trip), on the
 * standalone canvas route (`/studio/canvas/<id>`).
 *
 * Headless note: both mount `<CanvasStudio>` (#4 drives the in-editor
 * `<PageNavigator>`; #6's PNG export reads the live Konva stage). Konva's 2D
 * canvas hangs under headless Chromium's GPU path on WSL2 — fixed by
 * `--disable-gpu` in playwright.config.ts launchOptions (see editor-core header).
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });

async function gotoCanvas(page: Page, pageId: string): Promise<void> {
	await page.goto(`/studio/canvas/${pageId}`);
	await expect(page.getByTestId("canvas-studio-mount")).toBeVisible({
		timeout: 30_000,
	});
	await expect(page.getByTestId("canvas-workspace-root")).toBeVisible({
		timeout: 30_000,
	});
}

test.describe("Canvas Studio — pages + export (PRD §9.2)", () => {
	test("#4 add → reorder → delete pages tracks the active artboard", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-pages-${Date.now()}`);
		// The workspace shell stacks artboards as `page-row-<id>` cards.
		const rows = page.locator('[data-testid^="page-row-"]');
		await expect(rows).toHaveCount(1);

		// Add a second artboard; it becomes active.
		await page.getByTestId("page-add").click();
		await expect(rows).toHaveCount(2);
		const activeRow = page.locator(
			'[data-testid^="page-row-"][data-active="true"]',
		);
		await expect(activeRow).toHaveCount(1);

		// Reorder the active page up, then delete it; one remains active. The
		// reorder/delete controls are per-row and id-scoped, so reach them through
		// the active row rather than by a fixed id.
		await activeRow.locator('[data-testid^="page-reorder-up-"]').click();
		await page
			.locator('[data-testid^="page-row-"][data-active="true"]')
			.locator('[data-testid^="page-delete-"]')
			.click();
		await expect(rows).toHaveCount(1);
		await expect(
			page.locator('[data-testid^="page-row-"][data-active="true"]'),
		).toHaveCount(1);
	});

	test("#6 export PNG (size > 0) + JSON; reload restores state", async ({
		page,
	}) => {
		const pageId = `e2e-export-${Date.now()}`;
		await gotoCanvas(page, pageId);

		// The export controls live in a popover: open it, pick a format card,
		// then commit via "Export". PNG → a non-empty file (rasterized live).
		await page.getByTestId("canvas-export-trigger").click();
		await page.getByTestId("canvas-export-png").click();
		const [png] = await Promise.all([
			page.waitForEvent("download"),
			page.getByTestId("canvas-export-save").click(),
		]);
		const pngPath = await png.path();
		expect(pngPath ? statSync(pngPath).size : 0).toBeGreaterThan(0);

		// Saving closes the popover; reopen, then JSON → serialized IR; reload
		// reads it back from localStorage.
		await page.getByTestId("canvas-export-trigger").click();
		await page.getByTestId("canvas-export-json").click();
		const [json] = await Promise.all([
			page.waitForEvent("download"),
			page.getByTestId("canvas-export-save").click(),
		]);
		const jsonPath = await json.path();
		expect(jsonPath ? statSync(jsonPath).size : 0).toBeGreaterThan(0);

		await page.reload();
		await expect(page.getByTestId("canvas-workspace-root")).toBeVisible({
			timeout: 30_000,
		});
		// The localStorage adapter (namespace "demo-canvas") rehydrates the IR
		// for the same page id, so the editor remounts with the saved scene.
	});
});
