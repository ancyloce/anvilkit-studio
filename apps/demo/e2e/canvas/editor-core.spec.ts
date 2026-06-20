import { expect, type Page, test } from "@playwright/test";

/**
 * PRD §9.2 scenarios 1–3 — authoring on the standalone canvas route
 * (`/studio/canvas/<id>`). The route mounts the `<CanvasWorkspace>` shell —
 * Elements-panel tools + Property inspector — so tool selection, node creation,
 * multi-select move, and undo are all drivable through real DOM + real Konva
 * pointer events. Assertions read the host's machine-readable scene readout
 * (`canvas-ir-debug`) rather than reaching into the canvas.
 *
 * BLOCKED (test.fixme) — react-konva `<Stage>` does not render its canvas under
 * React 19.2.7 / Next 16. The editor mounts the host UI + container `<div>`, but
 * react-konva's reconciler never builds the Konva content (no `.konvajs-content`,
 * no `<canvas>`), headed OR headless. Verified by isolation (2026-05-23):
 * imperative `new Konva.Stage()` builds a canvas fine in the same env, and React
 * resolves to a single 19.2.7 instance — so this is react-konva's reconciler, not
 * Konva core or a duplicate React. (A separate headless-GPU hang is mitigated by
 * `--disable-gpu` in playwright.config.ts; that lets the DOM-driven canvas specs
 * — pages/AI/export — run, but does not make the canvas render.) These three
 * scenarios drive on-canvas pointer interaction, so they stay `test.fixme` until
 * the canvas-editor moves off react-konva's reconciler (plan MVP-1 imperative-
 * Konva mitigation). Flip `test.fixme` → `test` once the Stage renders.
 *
 * The first canvas mount dynamically imports Konva (its own chunk), so the
 * suite is serial with generous timeouts to absorb a cold dev-server compile
 * (CLAUDE.md test-infra note).
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });

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
	// surface finishes its (Konva-bearing) dynamic import.
	await expect(page.getByTestId("canvas-workspace-root")).toBeVisible({
		timeout: 30_000,
	});
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

/** Press-drag a box on the Konva stage, in stage-local coordinates. */
async function dragOnStage(
	page: Page,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
): Promise<void> {
	const box = await stageBox(page);
	await page.mouse.move(box.x + x1, box.y + y1);
	await page.mouse.down();
	await page.mouse.move(box.x + x2, box.y + y2, { steps: 10 });
	await page.mouse.up();
}

/** Single click on the Konva stage, in stage-local coordinates. */
async function clickStage(page: Page, x: number, y: number): Promise<void> {
	const box = await stageBox(page);
	await page.mouse.click(box.x + x, box.y + y);
}

test.describe("Canvas Studio — editor authoring (PRD §9.2)", () => {
	test.fixme("#1 inserts text, a rectangle, and an image via the tools", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-author-${Date.now()}`);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("0");

		// Rectangle — drag with the rect tool.
		await selectTool(page, "rect");
		await dragOnStage(page, 60, 60, 220, 180);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("1");

		// Text — click with the text tool (creates a "Text" node + opens the inline
		// editor), then return to select to close the editor and rename through the
		// PropertyInspector (deterministic vs. driving the textarea overlay).
		await selectTool(page, "text");
		await clickStage(page, 320, 120);
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
		await clickStage(page, 160, 320);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("3");

		const scene = await readScene(page);
		expect(scene.nodes.map((n) => n.type).sort()).toEqual([
			"image",
			"rect",
			"text",
		]);
	});

	test.fixme("#2 places an image via the image tool's asset picker", async ({
		page,
	}) => {
		// PRD §9.2 #2 describes dragging an image from an asset sidebar. This
		// editor ships no such sidebar — images are placed with the image tool,
		// which calls the host's onPickAsset() (the asset-picker seam). We assert
		// that functional path: tool click → asset resolved → image node created.
		await gotoCanvas(page, `e2e-image-${Date.now()}`);
		await selectTool(page, "image");
		await clickStage(page, 140, 140);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("1");
		expect(firstNode(await readScene(page)).type).toBe("image");
	});

	test.fixme("#3 select-all → move 100px → undo restores the prior state", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-move-${Date.now()}`);

		// A single rectangle keeps undo deterministic: a multi-node move commits
		// one node.move per node (matching the select tool's own behavior), so one
		// node ⇒ one undo fully reverts to the prior IR.
		await selectTool(page, "rect");
		await dragOnStage(page, 80, 80, 200, 180);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("1");

		const x0 = firstNode(await readScene(page)).x;

		await page.getByTestId("host-select-all").click();
		await expect(page.getByTestId("canvas-selected-count")).toHaveText("1");

		await page.getByTestId("host-nudge-x").click();
		await expect
			.poll(async () => firstNode(await readScene(page)).x)
			.toBe(x0 + 100);

		await page.getByTestId("host-undo").click();
		await expect.poll(async () => firstNode(await readScene(page)).x).toBe(x0);
	});
});
