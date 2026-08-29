import { expect, test } from "@playwright/test";

/**
 * PLAN-0039 E0-T5 merge-critical browser smoke.
 *
 * Keep this bounded to product boot: the complete authoring, persistence,
 * export, accessibility, performance, and stress scenarios have independent
 * jobs. A failure here means a released Canvas package cannot hydrate into a
 * usable real-browser stage or expose its host scene contract.
 */
test.describe.configure({ timeout: 180_000 });

test("Canvas route hydrates a stage and content-free scene readout", async ({
	page,
}) => {
	const pageId = `e0-smoke-${Date.now()}`;
	await page.goto(`/studio/canvas/${pageId}`);

	await expect(page.getByTestId("canvas-studio-mount")).toBeVisible({
		timeout: 30_000,
	});
	await expect(page.getByTestId("canvas-workspace-root")).toBeVisible({
		timeout: 120_000,
	});

	const stage = page.locator('[data-testid="pages-canvas"] canvas').first();
	await expect(stage).toBeAttached({ timeout: 30_000 });
	const bounds = await stage.boundingBox();
	expect(bounds?.width ?? 0).toBeGreaterThan(0);
	expect(bounds?.height ?? 0).toBeGreaterThan(0);

	const debug = JSON.parse(
		(await page.getByTestId("canvas-ir-debug").textContent()) ?? "{}",
	) as { count?: number; selected?: number };
	expect(debug).toMatchObject({ count: 0, selected: 0 });
});
