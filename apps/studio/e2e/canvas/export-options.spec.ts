import { expect, type Page, test } from "@playwright/test";

/**
 * PRD 0012 (B-09, FR-154) — `header/ExportDialog.tsx`'s scope/scale/format
 * options, on the standalone canvas route. `pages-export.spec.ts` #6 already
 * covers the format-and-run happy path (PNG + JSON, both producing a real
 * download); this file covers the OPTIONS the dialog exposes around that —
 * page scope, scale presets, aspect-locked custom size, and the format-
 * dependent quality/background controls — none of which #6 touches.
 */

const COLD_MOUNT_TIMEOUT_MS = 420_000;

test.describe.configure({ mode: "serial", timeout: COLD_MOUNT_TIMEOUT_MS });

async function gotoCanvas(page: Page, pageId: string): Promise<void> {
	await page.goto(`/studio/canvas/${pageId}`);
	await expect(page.getByTestId("canvas-studio-mount")).toBeVisible({
		timeout: 30_000,
	});
	await expect(page.getByTestId("canvas-workspace-root")).toBeVisible({
		timeout: COLD_MOUNT_TIMEOUT_MS,
	});
	await expect(
		page.locator('[data-testid="pages-canvas"] canvas').first(),
	).toBeAttached({ timeout: 60_000 });
	await page.getByTestId("panel-dock-elements").click();
}

async function selectTool(page: Page, tool: string): Promise<void> {
	await page.getByTestId(`elements-tool-${tool}`).click();
	await expect(page.getByTestId(`elements-tool-${tool}`)).toHaveAttribute(
		"data-active",
		"true",
	);
}

function atStage(
	box: { x: number; y: number; width: number; height: number },
	fx: number,
	fy: number,
) {
	return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

async function dragOnStage(
	page: Page,
	fx1: number,
	fy1: number,
	fx2: number,
	fy2: number,
): Promise<void> {
	const canvas = page.locator('[data-testid="pages-canvas"] canvas').first();
	const box = await canvas.boundingBox();
	if (!box) throw new Error("canvas stage not found");
	const from = atStage(box, fx1, fy1);
	const to = atStage(box, fx2, fy2);
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(to.x, to.y, { steps: 10 });
	await page.mouse.up();
}

test.describe("Canvas Studio — export dialog options (PRD 0012 B-09)", () => {
	test("#1 page scope: Selection is disabled until something is selected, then selectable", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-export-scope-${Date.now()}`);
		await selectTool(page, "rect");
		await dragOnStage(page, 0.15, 0.15, 0.45, 0.4);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("1");

		await page.getByTestId("workspace-export").click();
		await expect(page.getByTestId("export-dialog")).toBeVisible();
		// "Current page" is the default scope.
		await expect(page.getByTestId("export-pages-current")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(page.getByTestId("export-pages-selection")).toBeDisabled();

		await page.getByTestId("export-pages-all").click();
		await expect(page.getByTestId("export-pages-all")).toHaveAttribute(
			"aria-pressed",
			"true",
		);

		// Select the rect, then close/reopen isn't required — the dialog reads
		// live selection state.
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("export-dialog")).toBeHidden();
		await selectTool(page, "select");
		await page.getByTestId("host-select-all").dispatchEvent("click");
		await expect(page.getByTestId("canvas-selected-count")).toHaveText("1");

		await page.getByTestId("workspace-export").click();
		await expect(page.getByTestId("export-dialog")).toBeVisible();
		await expect(page.getByTestId("export-pages-selection")).toBeEnabled();
		await page.getByTestId("export-pages-selection").click();
		await expect(page.getByTestId("export-pages-selection")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	});

	test("#2 scale presets and aspect-locked custom size", async ({ page }) => {
		await gotoCanvas(page, `e2e-export-scale-${Date.now()}`);
		await page.getByTestId("workspace-export").click();
		await expect(page.getByTestId("export-dialog")).toBeVisible();
		await page.getByTestId("export-format-png").click();

		// Default resolution is 1x.
		await expect(page.getByTestId("export-scale-1")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await page.getByTestId("export-scale-2").click();
		await expect(page.getByTestId("export-scale-2")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(page.getByTestId("export-scale-1")).toHaveAttribute(
			"aria-pressed",
			"false",
		);

		// Custom width, with the aspect ratio locked (default on): setting width
		// recomputes height instead of leaving it independently editable.
		await expect(page.getByTestId("export-lock-aspect")).toBeChecked();
		await expect(page.getByTestId("export-height")).toBeDisabled();
		const widthInput = page.getByTestId("export-width");
		await widthInput.fill("2000");
		await expect
			.poll(async () => page.getByTestId("export-height").inputValue())
			.not.toBe("");

		// Unlocking makes height independently editable again.
		await page.getByTestId("export-lock-aspect").uncheck();
		await expect(page.getByTestId("export-height")).toBeEnabled();
		await page.getByTestId("export-height").fill("500");
		await expect(page.getByTestId("export-height")).toHaveValue("500");
	});

	test("#3 JPEG exposes a quality slider and forces the background on", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-export-jpeg-${Date.now()}`);
		await page.getByTestId("workspace-export").click();
		await expect(page.getByTestId("export-dialog")).toBeVisible();

		// PNG: no quality control (lossless); background is a free toggle.
		await page.getByTestId("export-format-png").click();
		await expect(page.getByTestId("export-quality")).toBeHidden();
		await expect(page.getByTestId("export-include-background")).toBeEnabled();

		// JPEG: quality appears, and "include background" locks disabled+unchecked
		// in the UI (`checked={includeBackground && !transparentDisabled}`) — JPEG
		// has no alpha channel, so the export always rasterizes onto a background
		// regardless of this control.
		await page.getByTestId("export-format-jpeg").click();
		await expect(page.getByTestId("export-quality")).toBeVisible();
		await expect(page.getByTestId("export-include-background")).toBeDisabled();
		await expect(
			page.getByTestId("export-include-background"),
		).not.toBeChecked();
	});
});
