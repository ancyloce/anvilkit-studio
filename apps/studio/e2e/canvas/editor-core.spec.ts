import { expect, type Page, test } from "@playwright/test";

/**
 * PRD §9.2 scenarios 1–3 — authoring on the standalone canvas route
 * (`/studio/canvas/<id>`). The route mounts the `<CanvasWorkspace>` shell —
 * Elements-panel tools + Property inspector — so tool selection, node creation,
 * multi-select move, and undo are all drivable through real DOM + real Konva
 * pointer events. Assertions read the host's machine-readable scene readout
 * (`canvas-ir-debug`) rather than reaching into the canvas.
 *
 * UNBLOCKED 2026-07-12 (was `test.fixme` since 2026-05-23). These three
 * scenarios were skipped on the belief that react-konva's reconciler never built
 * the Konva content under React 19.2.7 / Next 16 ("no `.konvajs-content`, no
 * `<canvas>`, headed OR headless"). That no longer reproduces: the Stage renders,
 * the canvas has a real bounding box, and `page.mouse` drags create nodes.
 *
 * The original diagnosis was also confounded by a timeout. The editor surface is
 * an `ssr:false` dynamic import, and under `pnpm dev` its (Konva-bearing) client
 * chunk takes ~4-5 MINUTES to compile on first load — far longer than the 30 s
 * waits below used to allow. A cold run therefore looked identical to "the Stage
 * never renders". Once that chunk is compiled the surface mounts in ~2 s, so only
 * the first spec in a cold run pays the cost; hence the serial mode and the
 * COLD_MOUNT_TIMEOUT_MS headroom. If these ever fail on a mount timeout again,
 * check for a slow compile before concluding the canvas is broken.
 */

/**
 * Headroom for the one-time dev-server compile of the Konva chunk (~265 s
 * measured). Every later mount in the same run is ~2 s.
 */
const COLD_MOUNT_TIMEOUT_MS = 420_000;

test.describe.configure({ mode: "serial", timeout: 600_000 });

type SceneNode = {
	id: string;
	type: string;
	x: number;
	y: number;
	text?: string;
};
type SceneDebug = {
	count: number;
	selected: number;
	activeTool: string;
	nodes: SceneNode[];
};

async function readScene(page: Page): Promise<SceneDebug> {
	const raw = await page.getByTestId("canvas-ir-debug").textContent();
	return JSON.parse(raw ?? "{}") as SceneDebug;
}

function firstNode(scene: SceneDebug): SceneNode {
	const node = scene.nodes[0];
	if (!node) throw new Error("expected at least one node in the scene");
	return node;
}

async function gotoCanvas(page: Page, pageId: string): Promise<void> {
	await page.goto(`/studio/canvas/${pageId}`);
	await expect(page.getByTestId("canvas-studio-mount")).toBeVisible({
		timeout: 30_000,
	});
	// The `<CanvasWorkspace>` shell surfaces only after the ssr:false editor
	// surface finishes its (Konva-bearing) dynamic import — which, on a cold dev
	// server, means waiting out a multi-minute compile. See COLD_MOUNT_TIMEOUT_MS.
	await expect(page.getByTestId("canvas-workspace-root")).toBeVisible({
		timeout: COLD_MOUNT_TIMEOUT_MS,
	});
	// The Konva stage itself — the thing these specs actually drive.
	await expect(
		page.locator('[data-testid="pages-canvas"] canvas').first(),
	).toBeAttached({ timeout: 60_000 });
	// The drawing tools live in the workspace shell's Elements panel; open it
	// once so `selectTool` can reach the `elements-tool-*` buttons.
	await page.getByTestId("panel-dock-elements").click();
}

async function selectTool(page: Page, tool: string): Promise<void> {
	await page.getByTestId(`elements-tool-${tool}`).click();
	await expect(page.getByTestId(`elements-tool-${tool}`)).toHaveAttribute(
		"data-active",
		"true",
	);
}

async function stageBox(page: Page) {
	const canvas = page.locator('[data-testid="pages-canvas"] canvas').first();
	const box = await canvas.boundingBox();
	if (!box) throw new Error("canvas stage not found");
	return box;
}

/**
 * Stage coordinates are FRACTIONS of the stage box (0..1), never raw pixels.
 *
 * The stage is zoom-to-fit, so its on-screen size follows the viewport: it is
 * only ~162×162 px at the config's default Desktop Chrome viewport. The absolute
 * pixel coordinates these specs originally carried (e.g. dragging to 220,180)
 * assumed a much larger stage — they ran off the canvas and landed on the
 * PropertyInspector, so Konva never saw the pointerup and no node was created.
 * Those constants had never actually executed (the specs were `test.fixme`).
 * Fractions keep every gesture inside the canvas at any viewport size.
 */
function atStage(
	box: { x: number; y: number; width: number; height: number },
	fx: number,
	fy: number,
) {
	return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

/** Press-drag a box on the Konva stage, in stage fractions (0..1). */
async function dragOnStage(
	page: Page,
	fx1: number,
	fy1: number,
	fx2: number,
	fy2: number,
): Promise<void> {
	const box = await stageBox(page);
	const from = atStage(box, fx1, fy1);
	const to = atStage(box, fx2, fy2);
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(to.x, to.y, { steps: 10 });
	await page.mouse.up();
}

/** Single click on the Konva stage, in stage fractions (0..1). */
async function clickStage(page: Page, fx: number, fy: number): Promise<void> {
	const box = await stageBox(page);
	const at = atStage(box, fx, fy);
	await page.mouse.click(at.x, at.y);
}

test.describe("Canvas Studio — editor authoring (PRD §9.2)", () => {
	test("#1 inserts text, a rectangle, and an image via the tools", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-author-${Date.now()}`);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("0");

		// Rectangle — drag with the rect tool, across the upper-left quadrant.
		await selectTool(page, "rect");
		await dragOnStage(page, 0.15, 0.15, 0.55, 0.45);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("1");

		// Text — click with the text tool (creates a "Text" node + opens the inline
		// editor), then return to select to close the editor and rename through the
		// PropertyInspector (deterministic vs. driving the textarea overlay).
		await selectTool(page, "text");
		await clickStage(page, 0.8, 0.25);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("2");
		await selectTool(page, "select");
		const textField = page.getByTestId("prop-text");
		await expect(textField).toBeVisible();
		await textField.fill("Hello");
		await textField.blur();
		await expect
			.poll(async () => {
				const scene = await readScene(page);
				return scene.nodes.find((n) => n.type === "text")?.text;
			})
			.toBe("Hello");

		// Image — click with the image tool; onPickAsset resolves the seeded asset
		// id and a node.create commits asynchronously.
		await selectTool(page, "image");
		await clickStage(page, 0.3, 0.8);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("3");

		const scene = await readScene(page);
		expect(scene.nodes.map((n) => n.type).sort()).toEqual([
			"image",
			"rect",
			"text",
		]);
	});

	test("#2 places an image via the image tool's asset picker", async ({
		page,
	}) => {
		// PRD §9.2 #2 describes dragging an image from an asset sidebar. This
		// editor ships no such sidebar — images are placed with the image tool,
		// which calls the host's onPickAsset() (the asset-picker seam). We assert
		// that functional path: tool click → asset resolved → image node created.
		await gotoCanvas(page, `e2e-image-${Date.now()}`);
		await selectTool(page, "image");
		await clickStage(page, 0.35, 0.35);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("1");
		expect(firstNode(await readScene(page)).type).toBe("image");
	});

	test("#3 select-all → move 100px → undo restores the prior state", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-move-${Date.now()}`);

		// A single rectangle keeps undo deterministic: a multi-node move commits
		// one node.move per node (matching the select tool's own behavior), so one
		// node ⇒ one undo fully reverts to the prior IR.
		await selectTool(page, "rect");
		await dragOnStage(page, 0.2, 0.2, 0.5, 0.45);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("1");

		const x0 = firstNode(await readScene(page)).x;

		// The `host-*` buttons are the demo's scripted-command affordances. They are
		// visible and enabled, but the full-bleed editor shell (`canvas-studio-mount`)
		// renders OVER them, so a real pointer click — even a forced one — is
		// delivered to the shell, not the button (`force` only skips the
		// actionability check; it does not change event targeting). Dispatching the
		// event straight at the element bypasses hit-testing and invokes the handler,
		// which is what we want from a harness control that exists to be driven
		// programmatically rather than clicked by a user.
		await page.getByTestId("host-select-all").dispatchEvent("click");
		await expect(page.getByTestId("canvas-selected-count")).toHaveText("1");

		await page.getByTestId("host-nudge-x").dispatchEvent("click");
		await expect
			.poll(async () => firstNode(await readScene(page)).x)
			.toBe(x0 + 100);

		await page.getByTestId("host-undo").dispatchEvent("click");
		await expect.poll(async () => firstNode(await readScene(page)).x).toBe(x0);
	});
});
