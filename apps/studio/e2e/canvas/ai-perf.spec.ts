import { expect, type Page, test } from "@playwright/test";

/**
 * PRD §9.2 scenarios 5 (AI text-to-image → node) and 7 (large-scene pan perf),
 * on the standalone canvas route (`/studio/canvas/<id>`).
 *
 * UNBLOCKED 2026-07-17 (was `test.fixme` since ~2026-05). #7's stated blocking
 * reason ("react-konva does not render under Playwright") was the same claim
 * `editor-core.spec.ts`'s header documents as resolved 2026-07-12 — it no
 * longer reproduces. `--disable-gpu` in playwright.config.ts prevents the
 * separate headless-GPU hang so both #5 and #7 can run.
 *
 * Coverage notes:
 *  • #5: the AI route guard (503 PROVIDER_DISABLED) + mock-provider result are
 *    also covered by `apps/studio/e2e/canvas-ai.spec.ts`. The "new image node
 *    appears on canvas" half additionally needs an `onSelectionChange` seam to
 *    commit `image.replace` (documented in CanvasStudioClient.tsx); this asserts
 *    the panel surfaces a result.
 *  • #7: true FPS / perf-trace assertions are out of scope for Playwright here;
 *    this seeds 200 nodes and asserts mount + a responsive pan as a smoke proxy.
 *    Hard FPS budgets live in the `bench/` harness (I2-4). Its pan gesture uses
 *    STAGE-FRACTION coordinates (see `atStage` below, ported from
 *    `editor-core.spec.ts`) — the stage is zoom-to-fit and only ~162×162px at
 *    the default viewport, so the absolute-pixel offsets this test originally
 *    carried (`box.x + 400`) ran off-canvas and had never actually executed
 *    (the test was `test.fixme` the whole time those constants existed).
 */
/**
 * Headroom for the one-time dev-server compile of the Konva chunk, ported
 * from `editor-core.spec.ts` — this file's own `gotoCanvas` (same route) hit
 * the identical cold-compile-looks-like-a-hang symptom that constant's header
 * documents: a fixed 30 s wait here was never enough to distinguish "still
 * compiling" from "actually broken" on a cold `pnpm dev`.
 */
const COLD_MOUNT_TIMEOUT_MS = 420_000;

test.describe.configure({ mode: "serial", timeout: COLD_MOUNT_TIMEOUT_MS });

/** Stage coordinates as FRACTIONS of the stage box (0..1) — see header note. */
function atStage(
	box: { x: number; y: number; width: number; height: number },
	fx: number,
	fy: number,
) {
	return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

async function gotoCanvas(page: Page, pageId: string): Promise<void> {
	await page.goto(`/studio/canvas/${pageId}`);
	await expect(page.getByTestId("canvas-studio-mount")).toBeVisible({
		timeout: 30_000,
	});
	// The `<CanvasWorkspace>` shell surfaces only after the ssr:false editor
	// surface finishes its (Konva-bearing) dynamic import — which, on a cold
	// dev server, means waiting out a multi-minute compile.
	await expect(page.getByTestId("canvas-workspace-root")).toBeVisible({
		timeout: COLD_MOUNT_TIMEOUT_MS,
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

	test("#7 renders a 200-node scene and stays responsive during a pan", async ({
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
		const from = atStage(box, 0.3, 0.3);
		const to = atStage(box, 0.7, 0.65);
		const started = Date.now();
		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		await page.mouse.move(to.x, to.y, { steps: 20 });
		await page.mouse.up();
		expect(Date.now() - started).toBeLessThan(3000);
	});
});
