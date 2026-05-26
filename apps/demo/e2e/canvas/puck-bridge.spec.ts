import { expect, type Page, test } from "@playwright/test";

/**
 * PRD §9.2 scenarios 8 (DesignBlock ↔ canvas overlay) and 9 (mode-switch
 * continuity), on the Puck editor route (`/puck/editor`), where the
 * `@anvilkit/plugin-canvas-studio` plugin registers an "Open Canvas" header
 * action + a viewport overlay (`canvas-mode-overlay`).
 *
 * The "Open Canvas" header-action test runs (DOM-only — `/puck/editor` does NOT
 * mount `<CanvasStudio>` until the overlay opens). #8/#9 are `test.fixme`: they
 * open the canvas overlay, whose react-konva `<Stage>` does not render under
 * React 19.2.6 / Next 16 (see editor-core.spec.ts header for the full root
 * cause). `--disable-gpu` in playwright.config.ts prevents the headless-GPU hang.
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });

async function gotoEditor(page: Page): Promise<void> {
	await page.goto("/puck/editor");
	// Vertical rail tablist is the editor's hydration signal (mirrors
	// pages-management.spec.ts); the editor cold-compile can take ~30s.
	await expect(
		page.locator('[role="tablist"][aria-orientation="vertical"]'),
	).toBeVisible({ timeout: 30_000 });
}

test.describe("Canvas Studio — Puck bridge (PRD §9.2)", () => {
	test("plugin-canvas-studio registers the Open Canvas header action", async ({
		page,
	}) => {
		// Proves the canvas-studio plugin mounted into <Studio> and contributed its
		// mode-switch header action. Presence is the assertion (the overlay-open
		// flow is exercised by #8/#9).
		await gotoEditor(page);
		await expect(
			page.getByRole("button", { name: "Open Canvas" }),
		).toBeVisible();
	});

	test.fixme("#8 DesignBlock overlay save renders a preview asset", async ({
		page,
	}) => {
		await gotoEditor(page);

		// Insert a DesignBlock; it starts with no preview.
		await page
			.getByRole("button", { name: /design block/i })
			.first()
			.click();
		await expect(page.getByTestId("design-block-empty")).toBeVisible();

		// Open the canvas overlay, make an edit, return to the page.
		await page.getByRole("button", { name: "Open Canvas" }).click();
		await expect(page.getByTestId("canvas-mode-overlay")).toBeVisible();
		// …author on the canvas…
		await page.getByTestId("workspace-back").click();

		// Back on the page, the block now renders its exported preview asset.
		await expect(page.getByTestId("design-block")).toBeVisible();
	});

	test.fixme("#9 mode-switch canvas → puck → canvas preserves design state", async ({
		page,
	}) => {
		await gotoEditor(page);
		await page
			.getByRole("button", { name: /design block/i })
			.first()
			.click();

		// Round 1: open → edit → back (commits a preview + designId).
		await page.getByRole("button", { name: "Open Canvas" }).click();
		await expect(page.getByTestId("canvas-mode-overlay")).toBeVisible();
		await page.getByTestId("workspace-back").click();
		await expect(page.getByTestId("design-block")).toBeVisible();

		// Round 2: reopen the same design — state persists via the mode-store +
		// localStorage adapter (same designId, same IR).
		await page.getByRole("button", { name: "Open Canvas" }).click();
		await expect(page.getByTestId("canvas-mode-overlay")).toBeVisible();
		await page.getByTestId("workspace-back").click();
		await expect(page.getByTestId("design-block")).toBeVisible();
	});
});
