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

async function nodeCount(page: Page): Promise<number> {
	return Number(await page.getByTestId("canvas-node-count").innerText());
}

test.describe("Canvas Studio — Templates panel (canvas-m0-009)", () => {
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
		await page.getByTestId("host-undo").click();
		await expect
			.poll(async () => nodeCount(page), { timeout: 15_000 })
			.toBe(before);
	});
});
