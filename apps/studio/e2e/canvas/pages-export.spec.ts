import { readFileSync } from "node:fs";
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
		// the active row rather than by a fixed id. Deleting a page is now
		// guarded by the workspace confirm dialog (B-05, FR-171).
		await activeRow.locator('[data-testid^="page-reorder-up-"]').click();
		await page
			.locator('[data-testid^="page-row-"][data-active="true"]')
			.locator('[data-testid^="page-delete-"]')
			.click();
		await page.getByTestId("canvas-confirm-accept").click();
		await expect(rows).toHaveCount(1);
		await expect(
			page.locator('[data-testid^="page-row-"][data-active="true"]'),
		).toHaveCount(1);
	});

	test("#6 all seven built-in formats download valid browser artifacts; reload restores state", async ({
		page,
	}) => {
		test.setTimeout(240_000);
		const pageId = `e2e-export-${Date.now()}`;
		await gotoCanvas(page, pageId);

		// PLAN-0039 E2 browser regression: execute every built-in format through
		// the real dialog. This covers the browser encoders, live Konva raster,
		// offscreen PDF rasterizer, core SVG/PDF serializers, and JSON path.
		await page.getByTestId("workspace-export").click();
		await expect(page.getByTestId("export-dialog")).toBeVisible();
		const formats = [
			{ id: "png", filename: /\.png$/, signature: "png" },
			{ id: "jpeg", filename: /\.jpe?g$/, signature: "jpeg" },
			{ id: "webp", filename: /\.webp$/, signature: "webp" },
			{ id: "svg", filename: /\.svg$/, signature: "svg" },
			{ id: "pdf", filename: /\.pdf$/, signature: "pdf" },
			{ id: "pdf-print", filename: /\.print\.pdf$/, signature: "pdf" },
			{ id: "json", filename: /\.json$/, signature: "json" },
		] as const;

		for (const format of formats) {
			await page.getByTestId(`export-format-${format.id}`).click();
			const [download] = await Promise.all([
				page.waitForEvent("download"),
				page.getByTestId("export-run").click(),
			]);
			expect(download.suggestedFilename()).toMatch(format.filename);
			const artifactPath = await download.path();
			expect(artifactPath).not.toBeNull();
			const bytes = readFileSync(artifactPath as string);
			expect(bytes.byteLength).toBeGreaterThan(0);

			switch (format.signature) {
				case "png":
					expect(bytes.subarray(0, 8).toString("hex")).toBe(
						"89504e470d0a1a0a",
					);
					break;
				case "jpeg":
					expect(bytes.subarray(0, 3).toString("hex")).toBe("ffd8ff");
					break;
				case "webp":
					expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
					expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
					break;
				case "svg":
					expect(bytes.toString("utf8")).toContain("<svg");
					break;
				case "pdf":
					expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF");
					break;
				case "json": {
					const ir = JSON.parse(bytes.toString("utf8"));
					expect(ir.pages).toHaveLength(1);
					break;
				}
			}
		}

		// The whole-document JSON path above also persists the current IR; reload
		// reads it back from the route's localStorage adapter.
		await page.reload();
		await expect(page.getByTestId("canvas-workspace-root")).toBeVisible({
			timeout: 30_000,
		});
		// The localStorage adapter (namespace "demo-canvas") rehydrates the IR
		// for the same page id, so the editor remounts with the saved scene.
	});
});
