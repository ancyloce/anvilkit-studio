import { expect, type Page, test } from "@playwright/test";

/**
 * PRD 0012 FR-020..023 (A-05) — clipboard on the standalone canvas route
 * (`/studio/canvas/<id>`). Copy/cut/paste/duplicate all run through the
 * built-in shortcut registry (`workspace/shortcuts/shortcut-registry.ts`:
 * Ctrl/Cmd+C, +X, +V, +D), which dispatches to `actions/clipboard-actions.ts`.
 * Every paste/duplicate offsets by `PASTE_OFFSET` (16px, both axes) from the
 * source position — that offset is the deterministic signal these tests read,
 * via the host's `canvas-ir-debug` readout (see editor-core.spec.ts's header
 * for why: assertions read the machine-readable scene, not Konva internals).
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

/** Draws one rect, selects it via the host control, and returns its IR node. */
async function createSelectedRect(page: Page): Promise<SceneNode> {
	await selectTool(page, "rect");
	await dragOnStage(page, 0.15, 0.15, 0.45, 0.4);
	await expect(page.getByTestId("canvas-node-count")).toHaveText("1");
	await selectTool(page, "select");
	await page.getByTestId("host-select-all").dispatchEvent("click");
	await expect(page.getByTestId("canvas-selected-count")).toHaveText("1");
	const scene = await readScene(page);
	const node = scene.nodes[0];
	if (!node) throw new Error("expected the rect just created");
	return node;
}

const modifier = process.platform === "darwin" ? "Meta" : "Control";

test.describe("Canvas Studio — clipboard (PRD 0012 FR-020..023)", () => {
	test("#1 copy + paste creates an offset copy, leaving the source untouched", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-clip-copy-${Date.now()}`);
		const source = await createSelectedRect(page);

		await page.keyboard.press(`${modifier}+c`);
		await page.keyboard.press(`${modifier}+v`);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("2");

		const scene = await readScene(page);
		const original = scene.nodes.find((n) => n.id === source.id);
		const pasted = scene.nodes.find((n) => n.id !== source.id);
		expect(original?.x).toBe(source.x);
		expect(original?.y).toBe(source.y);
		expect(pasted?.x).toBe(source.x + 16);
		expect(pasted?.y).toBe(source.y + 16);
		// Paste selects the new node(s), not the source.
		expect(scene.selected).toBe(1);
	});

	test("#2 cut removes the selection; paste restores it from the clipboard", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-clip-cut-${Date.now()}`);
		const source = await createSelectedRect(page);

		await page.keyboard.press(`${modifier}+x`);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("0");

		await page.keyboard.press(`${modifier}+v`);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("1");
		const scene = await readScene(page);
		const pasted = scene.nodes[0];
		// pasteImpl() unconditionally offsets by PASTE_OFFSET from the
		// snapshotted (pre-delete) position — cut does not special-case the
		// first paste back to the original spot.
		expect(pasted?.x).toBe(source.x + 16);
		expect(pasted?.y).toBe(source.y + 16);
	});

	test("#3 duplicate offsets a copy without touching the system/internal clipboard", async ({
		page,
	}) => {
		await gotoCanvas(page, `e2e-clip-dup-${Date.now()}`);
		const source = await createSelectedRect(page);

		await page.keyboard.press(`${modifier}+d`);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("2");

		const scene = await readScene(page);
		const duplicate = scene.nodes.find((n) => n.id !== source.id);
		expect(duplicate?.x).toBe(source.x + 16);
		expect(duplicate?.y).toBe(source.y + 16);
		// The duplicate is selected; the source is not.
		expect(scene.selected).toBe(1);

		// A subsequent plain paste (Ctrl+V) still works off whatever the last
		// copy/cut/duplicate wrote — duplicate does not clear the clipboard, but
		// nothing was ever explicitly copied in this test, so paste is a no-op
		// (count stays 2) rather than erroring.
		await page.keyboard.press(`${modifier}+v`);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("2");
	});
});
