import { expect, type Page, test } from "@playwright/test";

/**
 * PRD §9.2 scenarios 5 (AI text-to-image → node) and 7 (large-scene pan perf),
 * on the standalone canvas route (`/studio/canvas/<id>`).
 *
 * #5 (AI panel, DOM-driven) runs. #7 is `test.fixme`: it pans the live canvas,
 * which react-konva does not render under React 19.2.7 / Next 16 (see the
 * editor-core.spec.ts header for the full root cause). `--disable-gpu` in
 * playwright.config.ts prevents the separate headless-GPU hang so #5 can run.
 *
 * Coverage notes:
 *  • #5: the AI route guard (503 PROVIDER_DISABLED) + mock-provider result are
 *    also covered by `apps/studio/e2e/canvas-ai.spec.ts`. The "new image node
 *    appears on canvas" half additionally needs an `onSelectionChange` seam to
 *    commit `image.replace` (documented in CanvasStudioClient.tsx); this asserts
 *    the panel surfaces a result.
 *  • #7: true FPS / perf-trace assertions are out of scope for Playwright here;
 *    this seeds 200 nodes and asserts mount + a responsive pan as a smoke proxy.
 *    Hard FPS budgets live in the `bench/` harness (I2-4).
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });

async function gotoCanvas(page: Page, pageId: string): Promise<void> {
	await page.goto(`/studio/canvas/${pageId}`);
	await expect(page.getByTestId("canvas-studio-mount")).toBeVisible({
		timeout: 30_000,
	});
	// The `<CanvasWorkspace>` shell surfaces only after the ssr:false editor
	// surface finishes its (Konva-bearing) dynamic import.
	await expect(page.getByTestId("canvas-workspace-root")).toBeVisible({
		timeout: 30_000,
	});
}

/**
 * A 200-rectangle CanvasIR, in the shape `@anvilkit/canvas-core`'s
 * `createCanvasIR` produces, for seeding via localStorage. Kept inline (rather
 * than importing canvas-core into the spec) so the E2E stays dependency-light.
 */
function build200NodeIR(pageId: string) {
	const children = Array.from({ length: 200 }, (_, i) => ({
		id: `n${i}`,
		type: "rect" as const,
		name: `rect ${i}`,
		transform: { x: (i % 20) * 50, y: Math.floor(i / 20) * 50, rotation: 0 },
		bounds: { width: 40, height: 40 },
		opacity: 1,
		visible: true,
		locked: false,
		fill: "#2563eb",
	}));
	return {
		id: pageId,
		title: pageId,
		pages: [
			{
				id: pageId,
				name: pageId,
				size: { width: 1080, height: 1080, unit: "px" },
				background: { type: "color", color: "#ffffff" },
				root: {
					id: `${pageId}-root`,
					type: "group" as const,
					transform: { x: 0, y: 0, rotation: 0 },
					bounds: { width: 1080, height: 1080 },
					opacity: 1,
					visible: true,
					locked: false,
					children,
				},
			},
		],
		assets: {},
	};
}

test.describe("Canvas Studio — AI + perf (PRD §9.2)", () => {
	test("#5 AI panel mock text-to-image surfaces a result", async ({ page }) => {
		await gotoCanvas(page, `e2e-ai-${Date.now()}`);
		await expect(page.getByTestId("ak-module-ai-image")).toBeVisible();

		await page.getByTestId("ai-image-op-text-to-image").click();
		await page.getByTestId("ai-image-prompt").fill("a cat");
		const run = page.getByTestId("ai-image-run");
		await expect(run).toBeEnabled();
		await run.click();

		await expect(page.getByTestId("ai-image-result")).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByTestId("ai-image-error")).toHaveCount(0);
	});

	test.fixme("#7 renders a 200-node scene and stays responsive during a pan", async ({
		page,
	}) => {
		const pageId = `e2e-perf-${Date.now()}`;
		const ir = build200NodeIR(pageId);
		// Seed the design under the localStorageCanvasAdapter's record key
		// (`<namespace>:designs:<id>`, namespace "demo-canvas") so the route
		// rehydrates a 200-node scene on load.
		await page.addInitScript(
			([key, value]) => {
				window.localStorage.setItem(key, value);
			},
			[`demo-canvas:designs:${pageId}`, JSON.stringify(ir)] as const,
		);

		await gotoCanvas(page, pageId);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("200");

		// Pan with the hand tool; assert the gesture completes within a coarse
		// time budget (proxy for "stays responsive" — not a true FPS trace). The
		// drawing tools live in the workspace shell's Elements panel.
		await page.getByTestId("panel-dock-elements").click();
		await page.getByTestId("elements-tool-hand").click();
		const canvas = page.locator('[data-testid="pages-canvas"] canvas').first();
		const box = await canvas.boundingBox();
		if (!box) throw new Error("stage canvas not found");
		const started = Date.now();
		await page.mouse.move(box.x + 200, box.y + 200);
		await page.mouse.down();
		await page.mouse.move(box.x + 400, box.y + 350, { steps: 20 });
		await page.mouse.up();
		expect(Date.now() - started).toBeLessThan(3000);
	});
});
