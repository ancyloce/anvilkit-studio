import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * PRD 0012 FR-050 (layer panel reorder/reparent/collapse), on the standalone
 * canvas route. `panels/LayerPanel.tsx` drives reorder/reparent through
 * native HTML5 drag-and-drop (`draggable`/`onDragStart`/`onDragOver`/
 * `onDrop`), not pointer events or @dnd-kit — Playwright's `locator.dragTo()`
 * is the supported way to simulate that in Chromium (plain `page.mouse`
 * moves never fire dragstart/dragover/drop). The drop-zone rule
 * (`handleDragOver`): the middle 50% of a CONTAINER row's height is "inside"
 * (reparent); the top/bottom quarter of any row, or anywhere on a non-
 * container row, is "before"/"after" (sibling reorder).
 */

const COLD_MOUNT_TIMEOUT_MS = 420_000;

test.describe.configure({ mode: "serial", timeout: COLD_MOUNT_TIMEOUT_MS });

type SceneNode = { id: string; type: string; x: number; y: number };
type SceneDebug = { count: number; selected: number; nodes: SceneNode[] };

async function readScene(page: Page): Promise<SceneDebug> {
	const raw = await page.getByTestId("canvas-ir-debug").textContent();
	return JSON.parse(raw ?? "{}") as SceneDebug;
}

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

async function draw(
	page: Page,
	tool: string,
	fx1: number,
	fy1: number,
	fx2: number,
	fy2: number,
): Promise<void> {
	await selectTool(page, tool);
	await dragOnStage(page, fx1, fy1, fx2, fy2);
}

/** The layer row's own Y position (top-left), for order/collapse assertions. */
async function rowTop(row: Locator): Promise<number> {
	const box = await row.boundingBox();
	if (!box) throw new Error("expected the layer row to be visible");
	return box.y;
}

test.describe("Canvas Studio — layer tree (PRD 0012 FR-050)", () => {
	test("#1 dragging a row to the top quarter of a sibling reorders it before that sibling", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-layers-reorder-${Date.now()}`);
		await draw(page, "rect", 0.1, 0.1, 0.35, 0.3);
		await draw(page, "rect", 0.45, 0.45, 0.7, 0.65);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("2");
		const scene = await readScene(page);
		const [firstId, secondId] = scene.nodes.map((n) => n.id);
		if (!firstId || !secondId) throw new Error("expected two rects");

		await page.getByTestId("panel-dock-layers").click();
		const firstRow = page.getByTestId(`layer-row-${firstId}`);
		const secondRow = page.getByTestId(`layer-row-${secondId}`);
		await expect(firstRow).toBeVisible();
		await expect(secondRow).toBeVisible();

		const topBefore = await rowTop(firstRow);
		const bottomBefore = await rowTop(secondRow);
		// The panel lists rows in a fixed vertical order; whichever of the two
		// currently renders lower is the one we drag to just above the other.
		const [dragRow, targetRow] =
			bottomBefore > topBefore ? [secondRow, firstRow] : [firstRow, secondRow];

		const targetBox = await targetRow.boundingBox();
		if (!targetBox) throw new Error("expected the target row to be visible");
		await dragRow.dragTo(targetRow, {
			targetPosition: { x: targetBox.width / 2, y: targetBox.height * 0.1 },
		});

		await expect
			.poll(async () => (await rowTop(dragRow)) < (await rowTop(targetRow)))
			.toBe(true);
	});

	test("#2 dragging a row onto the middle of a frame row reparents it inside", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-layers-reparent-${Date.now()}`);
		await draw(page, "frame", 0.05, 0.05, 0.9, 0.9);
		await draw(page, "rect", 0.1, 0.1, 0.3, 0.25);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("2");
		const scene = await readScene(page);
		const frame = scene.nodes.find((n) => n.type === "frame");
		const rect = scene.nodes.find((n) => n.type === "rect");
		if (!frame || !rect) throw new Error("expected a frame and a rect");

		await page.getByTestId("panel-dock-layers").click();
		const frameRow = page.getByTestId(`layer-row-${frame.id}`);
		const rectRow = page.getByTestId(`layer-row-${rect.id}`);
		await expect(frameRow).toBeVisible();
		await expect(rectRow).toBeVisible();

		const frameBox = await frameRow.boundingBox();
		if (!frameBox) throw new Error("expected the frame row to be visible");
		await rectRow.dragTo(frameRow, {
			targetPosition: { x: frameBox.width / 2, y: frameBox.height / 2 },
		});

		// Reparenting into the frame removes the rect from the PAGE's top-level
		// children — the readout only lists top-level nodes.
		await expect(page.getByTestId("canvas-node-count")).toHaveText("1");
	});

	test("#3 collapsing a frame hides its children's rows; expanding restores them", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-layers-collapse-${Date.now()}`);
		await draw(page, "frame", 0.05, 0.05, 0.9, 0.9);
		await draw(page, "rect", 0.1, 0.1, 0.3, 0.25);
		const scene = await readScene(page);
		const frame = scene.nodes.find((n) => n.type === "frame");
		const rect = scene.nodes.find((n) => n.type === "rect");
		if (!frame || !rect) throw new Error("expected a frame and a rect");

		await page.getByTestId("panel-dock-layers").click();
		const frameRow = page.getByTestId(`layer-row-${frame.id}`);
		const rectRow = page.getByTestId(`layer-row-${rect.id}`);
		const frameBox = await frameRow.boundingBox();
		if (!frameBox) throw new Error("expected the frame row to be visible");
		await rectRow.dragTo(frameRow, {
			targetPosition: { x: frameBox.width / 2, y: frameBox.height / 2 },
		});
		await expect(page.getByTestId("canvas-node-count")).toHaveText("1");
		await expect(rectRow).toBeVisible();

		// FR-050 fold: collapsing removes the descendant row from the rendered
		// list entirely (not just visual hiding).
		await page.getByTestId(`layer-row-${frame.id}-toggle`).click();
		await expect(rectRow).toBeHidden();

		await page.getByTestId(`layer-row-${frame.id}-toggle`).click();
		await expect(rectRow).toBeVisible();
	});
});
