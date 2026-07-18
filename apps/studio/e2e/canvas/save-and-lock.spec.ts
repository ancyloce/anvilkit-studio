import { expect, type Page, test } from "@playwright/test";

/**
 * PRD 0012 — persistence and lock enforcement on the standalone canvas route.
 *
 * §15.16 wiring (2026-07-17): `CanvasStudioClient.tsx` now passes
 * `persistenceAdapter` (a bridge over `localStorageCanvasAdapter`, keyed by
 * this route's pageId) into `<CanvasEditorSurface>`, so the editor's built-in
 * save pipeline is live here: the `workspace-save-status` pill
 * (`data-status`: clean → dirty → saving → saved), debounced auto-save, the
 * `beforeunload` guard, and unmount flush. #1 drives that pipeline
 * end-to-end — it waits for the pill to reach `saved` (deterministic, and it
 * proves the wiring) before reloading, which also guarantees the guard won't
 * fire during the reload. Lock enforcement's delete-protection half is #2;
 * the hit-test-skip half is covered by keyboard-shortcuts.spec.ts #4.
 */

const COLD_MOUNT_TIMEOUT_MS = 420_000;

test.describe.configure({ mode: "serial", timeout: COLD_MOUNT_TIMEOUT_MS });

type SceneNode = { id: string; type: string; x: number; y: number };
type SceneDebug = {
	count: number;
	selected: number;
	activeTool?: string;
	nodes: SceneNode[];
};

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
	const before = (await readScene(page)).count;
	await selectTool(page, tool);
	await dragOnStage(page, fx1, fy1, fx2, fy2);
	// Fail HERE, not several assertions later, when the drag created nothing.
	// The page is zoom-to-fit inside the stage box with a gray margin band, so
	// stage-box fractions too close to the edges land OUTSIDE the page and the
	// draw tool ignores them — keep coordinates within ~0.2..0.8 of the box.
	await expect
		.poll(async () => (await readScene(page)).count, { timeout: 10_000 })
		.toBe(before + 1);
	// FR-012 return-to-Select rides the rAF-coalesced commit on pointerup, so
	// it can land AFTER whatever this helper's caller does next. Racing it —
	// e.g. re-clicking a creation tool immediately — gets the explicit tool
	// choice reverted to Select mid-gesture and the next drag draws nothing.
	// Wait for the completion flip to settle before returning.
	await expect
		.poll(async () => (await readScene(page)).activeTool ?? "select", {
			timeout: 10_000,
		})
		.toBe("select");
}

test.describe("Canvas Studio — save and lock enforcement", () => {
	test("#1 edits persist across a reload (built-in save pipeline)", async ({
		page,
	}) => {
		const pageId = `e2e-save-${Date.now()}`;
		await gotoCanvas(page, pageId);
		await draw(page, "rect", 0.15, 0.15, 0.45, 0.4);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("1");
		const before = await readScene(page);
		const savedId = before.nodes[0]?.id;
		if (!savedId) throw new Error("expected the rect just created");

		// The edit marks the document dirty; the debounced auto-save (default
		// 1.5 s) then lands it in localStorage. Waiting for the pill to reach
		// `saved` is deterministic (no racy fixed sleep) and doubles as the
		// assertion that the §15.16 adapter wiring is actually live. It also
		// guarantees `canLeave()` is true, so the beforeunload guard cannot
		// interfere with the reload below.
		await expect(page.getByTestId("workspace-save-status")).toHaveAttribute(
			"data-status",
			"saved",
			{ timeout: 15_000 },
		);
		await page.reload();
		await expect(page.getByTestId("canvas-studio-mount")).toBeVisible({
			timeout: 30_000,
		});
		await expect(page.getByTestId("canvas-workspace-root")).toBeVisible({
			timeout: COLD_MOUNT_TIMEOUT_MS,
		});
		await expect(page.getByTestId("canvas-node-count")).toHaveText("1");
		const after = await readScene(page);
		expect(after.nodes[0]?.id).toBe(savedId);
	});

	test("#2 delete skips locked nodes but still deletes unlocked ones in the same selection", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-lock-delete-${Date.now()}`);
		// Coordinates sit inside the zoom-to-fit page rect (see draw()'s note):
		// at the runner's 1280×720 viewport the stage box is ~151px square and
		// (0.1, 0.1) falls in the margin band outside the page, where the draw
		// tool creates nothing.
		await draw(page, "rect", 0.2, 0.25, 0.38, 0.4);
		await draw(page, "rect", 0.5, 0.5, 0.7, 0.65);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("2");
		const scene = await readScene(page);
		const [lockedTargetId] = scene.nodes.map((n) => n.id);
		if (!lockedTargetId) throw new Error("expected two rects");

		// Lock only the first rect. Locking clears the selection (a locked node
		// cannot stay selected), so re-select both afterward.
		await selectTool(page, "select");
		await page.getByTestId("panel-dock-layers").click();
		await page.getByTestId(`layer-row-${lockedTargetId}-lock`).click();
		await page.getByTestId("panel-dock-elements").click();
		await page.getByTestId("host-select-all").dispatchEvent("click");

		await page.keyboard.press(
			process.platform === "darwin" ? "Backspace" : "Delete",
		);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("1");
		const remaining = await readScene(page);
		expect(remaining.nodes[0]?.id).toBe(lockedTargetId);
	});
});
