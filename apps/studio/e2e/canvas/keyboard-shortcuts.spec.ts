import { expect, type Page, test } from "@playwright/test";

/**
 * PRD 0012 FR-040 (A-04) — the workspace shortcut registry
 * (`workspace/shortcuts/shortcut-registry.ts`), on the standalone canvas
 * route. Undo/redo and copy/cut/paste/duplicate already have dedicated
 * coverage (editor-core.spec.ts #3, clipboard.spec.ts) — this file covers the
 * remaining built-in bindings: tool-switch letter keys, group/ungroup,
 * delete, zoom, lock, and the Escape cancel precedence stack
 * (`actions/cancel-action.ts`).
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

async function drawRect(
	page: Page,
	fx1: number,
	fy1: number,
	fx2: number,
	fy2: number,
): Promise<void> {
	await selectTool(page, "rect");
	await dragOnStage(page, fx1, fy1, fx2, fy2);
}

const modifier = process.platform === "darwin" ? "Meta" : "Control";

test.describe("Canvas Studio — keyboard shortcuts (PRD 0012 FR-040)", () => {
	test("#1 letter keys switch tools (v/r/h)", async ({ page }) => {
		await gotoCanvas(page, `e2e-kbd-tools-${Date.now()}`);
		// A tool letter is only routed by the workspace registry, not an input —
		// clicking the stage first keeps focus inside the workspace root.
		const canvas = page.locator('[data-testid="pages-canvas"] canvas').first();
		await canvas.click();

		await page.keyboard.press("r");
		await expect(page.getByTestId("elements-tool-rect")).toHaveAttribute(
			"data-active",
			"true",
		);
		await page.keyboard.press("h");
		await expect(page.getByTestId("elements-tool-hand")).toHaveAttribute(
			"data-active",
			"true",
		);
		await page.keyboard.press("v");
		await expect(page.getByTestId("elements-tool-select")).toHaveAttribute(
			"data-active",
			"true",
		);
	});

	test("#2 Delete removes the selection", async ({ page }) => {
		await gotoCanvas(page, `e2e-kbd-delete-${Date.now()}`);
		await drawRect(page, 0.15, 0.15, 0.45, 0.4);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("1");

		await selectTool(page, "select");
		await page.getByTestId("host-select-all").dispatchEvent("click");
		await expect(page.getByTestId("canvas-selected-count")).toHaveText("1");

		await page.keyboard.press("Delete");
		await expect(page.getByTestId("canvas-node-count")).toHaveText("0");
	});

	test("#3 Ctrl/Cmd+G groups; Ctrl/Cmd+Shift+G ungroups", async ({ page }) => {
		await gotoCanvas(page, `e2e-kbd-group-${Date.now()}`);
		await drawRect(page, 0.1, 0.1, 0.35, 0.3);
		await drawRect(page, 0.45, 0.45, 0.7, 0.65);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("2");

		await selectTool(page, "select");
		await page.getByTestId("host-select-all").dispatchEvent("click");
		await expect(page.getByTestId("canvas-selected-count")).toHaveText("2");

		await page.keyboard.press(`${modifier}+g`);
		// Grouping folds both top-level rects under one new group node.
		await expect(page.getByTestId("canvas-node-count")).toHaveText("1");
		const grouped = await readScene(page);
		expect(grouped.nodes[0]?.type).toBe("group");

		await page.keyboard.press(`${modifier}+Shift+g`);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("2");
	});

	test("#4 Ctrl/Cmd+Shift+L toggles lock; a locked node's stage click passes through", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-kbd-lock-${Date.now()}`);
		await drawRect(page, 0.15, 0.15, 0.45, 0.4);
		await selectTool(page, "select");
		await page.getByTestId("host-select-all").dispatchEvent("click");
		await expect(page.getByTestId("canvas-selected-count")).toHaveText("1");

		await page.keyboard.press(`${modifier}+Shift+l`);

		// select-tool.ts skips locked nodes during hit-test — clicking where the
		// (now-locked, deselected-by-lock-toggle) rect sits must NOT re-select it.
		const canvas = page.locator('[data-testid="pages-canvas"] canvas').first();
		const box = await canvas.boundingBox();
		if (!box) throw new Error("stage canvas not found");
		await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.25);
		await expect(page.getByTestId("canvas-selected-count")).toHaveText("0");

		// Unlock via the same shortcut on the (still-known) layer row, then confirm
		// a click selects it again.
		await page.getByTestId("panel-dock-layers").click();
		const scene = await readScene(page);
		const nodeId = scene.nodes[0]?.id;
		if (!nodeId) throw new Error("expected the locked rect to still exist");
		await page.getByTestId(`layer-row-${nodeId}-lock`).click();
		await page.getByTestId("panel-dock-elements").click();
		await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.25);
		await expect(page.getByTestId("canvas-selected-count")).toHaveText("1");
	});

	test("#5 Ctrl/Cmd+= zooms in", async ({ page }) => {
		await gotoCanvas(page, `e2e-kbd-zoom-${Date.now()}`);
		const canvas = page.locator('[data-testid="pages-canvas"] canvas').first();
		await canvas.click();

		const before = await page
			.getByTestId("workspace-header-zoom")
			.textContent();
		const beforePct = Number.parseInt(before ?? "0", 10);
		await page.keyboard.press(`${modifier}+=`);
		await expect
			.poll(async () => {
				const text = await page
					.getByTestId("workspace-header-zoom")
					.textContent();
				return Number.parseInt(text ?? "0", 10);
			})
			.toBeGreaterThan(beforePct);
	});

	test("#6 Escape: first cancels the active tool, then clears the selection", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-kbd-escape-${Date.now()}`);
		const canvas = page.locator('[data-testid="pages-canvas"] canvas').first();

		// Step 1 of the precedence stack: a non-select tool reverts to Select.
		await page.keyboard.press("r");
		await expect(page.getByTestId("elements-tool-rect")).toHaveAttribute(
			"data-active",
			"true",
		);
		await canvas.click();
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("elements-tool-select")).toHaveAttribute(
			"data-active",
			"true",
		);

		// Step 2: with Select already active, Escape clears the selection instead.
		await drawRect(page, 0.15, 0.15, 0.45, 0.4);
		await selectTool(page, "select");
		await page.getByTestId("host-select-all").dispatchEvent("click");
		await expect(page.getByTestId("canvas-selected-count")).toHaveText("1");
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("canvas-selected-count")).toHaveText("0");
	});
});
