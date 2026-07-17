/**
 * Canvas-editor E2E for the docs playground (PRD 0012 §17.5/§21.8, F5).
 *
 * The docs playground (`/playground`) mounts the SAME `@anvilkit/plugin-canvas-studio`
 * plugin apps/studio's `/puck/editor` route does (`canvas-studio-lazy.ts`), with no
 * app-local wiring of its own — it purely inherits the plugin's built-in Layers
 * quick-add → canvas-overlay flow. `playground.spec.ts` is a generic Puck smoke
 * test that never opens the canvas overlay; this spec is the first to actually
 * drive it here, mirroring apps/studio's `puck-bridge.spec.ts` #8 pattern.
 *
 * Unlike apps/studio's `/puck/editor`, the docs playground has no iframe-isolated
 * preview (`playground.spec.ts` already asserts content directly on the page via
 * `.anvilkit-playground__canvas`), so a committed DesignBlock's preview is
 * asserted directly with `page.getByTestId`, not a `frameLocator`.
 */
import { expect, type Page, test } from "@playwright/test";

const OVERLAY = '[data-testid="canvas-mode-overlay"]';

async function gotoPlayground(page: Page): Promise<void> {
	await page.goto("/playground");
	await expect(page.getByTestId("playground-root")).toBeVisible({
		timeout: 30_000,
	});
}

async function waitForStage(page: Page): Promise<void> {
	await expect(page.locator(OVERLAY)).toBeVisible({ timeout: 30_000 });
	await expect(page.locator(`${OVERLAY} canvas`).first()).toBeVisible({
		timeout: 45_000,
	});
}

/** Stage coordinates as FRACTIONS of the stage box (0..1) — the stage is
 * zoom-to-fit, same as apps/studio's canvas routes. */
function atStage(
	box: { x: number; y: number; width: number; height: number },
	fx: number,
	fy: number,
) {
	return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

test.describe("Docs playground — canvas overlay (F5)", () => {
	test("insert Design Block, draw a shape on the canvas overlay, commit, and see the preview render", async ({
		page,
	}) => {
		await gotoPlayground(page);

		// Open the Layers rail and quick-add a Design Block (same flow
		// apps/studio's design-block-preview.helpers.ts drives — this is the
		// shared `@anvilkit/core` Studio shell, not docs-local code).
		await page
			.locator('[data-testid="ak-rail-tab-layer"], #ak-rail-tab-layer')
			.first()
			.click();
		await page.getByTestId("ak-layer-layers-add").click();
		await expect(page.getByTestId("ak-layer-quickadd-popup")).toBeVisible({
			timeout: 10_000,
		});
		await page
			.getByRole("menuitem", { name: /design block/i })
			.first()
			.click();

		// The quick-add auto-opens the canvas against a fresh design.
		await waitForStage(page);

		// Draw a rectangle so there is real content to commit and preview.
		await page.getByTestId("panel-dock-elements").click();
		await page.getByTestId("elements-tool-rect").click();
		const canvas = page
			.locator(`${OVERLAY} [data-testid="pages-canvas"] canvas`)
			.first();
		const box = await canvas.boundingBox();
		if (!box) throw new Error("overlay stage canvas not found");
		const from = atStage(box, 0.15, 0.15);
		const to = atStage(box, 0.55, 0.45);
		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		await page.mouse.move(to.x, to.y, { steps: 10 });
		await page.mouse.up();
		await expect(page.getByTestId("canvas-node-count")).toHaveText("1");

		// Commit and close.
		await page.getByTestId("workspace-back").click();
		await expect(page.locator(OVERLAY)).toBeHidden({ timeout: 15_000 });

		// The block renders its exported preview asset in place of the empty
		// state — proves the full insert → draw → commit → render pipeline
		// works end-to-end on this mount, not just that the overlay opens.
		const block = page.getByTestId("design-block");
		await expect(block).toBeVisible({ timeout: 20_000 });
		await expect(block.locator("img")).toHaveAttribute("src", /\S/);
		await expect(page.getByTestId("design-block-empty")).toBeHidden();
	});
});
