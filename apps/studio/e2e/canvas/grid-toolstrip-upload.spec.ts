import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, type Page, test } from "@playwright/test";

/**
 * PRD 0012 remaining-gap E2E (FR-112 / FR-010 / FR-091..093 / AC-012):
 * grid rendering + settings, the floating tool strip, upload drag-and-drop
 * with drag-to-replace, 1024 px responsive behavior, and an axe pass over
 * the grid-settings dialog. Runs on the standalone canvas route like
 * `editor-core.spec.ts` (same cold-compile headroom and stage-fraction
 * conventions — see that file's header for why).
 */

const require = createRequire(import.meta.url);
const axeCoreSource = readFileSync(
	require.resolve("axe-core/axe.min.js"),
	"utf8",
);

const COLD_MOUNT_TIMEOUT_MS = 420_000;

test.describe.configure({ mode: "serial", timeout: 600_000 });

type SceneNode = { id: string; type: string; x: number; y: number };
type SceneDebug = { count: number; nodes: SceneNode[] };

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
}

async function stageBox(page: Page) {
	const canvas = page.locator('[data-testid="pages-canvas"] canvas').first();
	const box = await canvas.boundingBox();
	if (!box) throw new Error("canvas stage not found");
	return box;
}

function atStage(
	box: { x: number; y: number; width: number; height: number },
	fx: number,
	fy: number,
) {
	return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

/** Dispatch a real DragEvent drop with an in-browser File at a client point. */
async function dropFileAt(
	page: Page,
	point: { x: number; y: number },
): Promise<void> {
	await page.evaluate(({ x, y }) => {
		const zone = document.querySelector('[data-testid="canvas-drop-zone"]');
		if (!zone) throw new Error("canvas-drop-zone not found");
		// A tiny but VALID png so the data-url uploader produces a decodable asset.
		const bytes = Uint8Array.from(
			atob(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
			),
			(c) => c.charCodeAt(0),
		);
		const file = new File([bytes], "e2e-drop.png", { type: "image/png" });
		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(file);
		for (const type of ["dragover", "drop"] as const) {
			zone.dispatchEvent(
				new DragEvent(type, {
					bubbles: true,
					cancelable: true,
					clientX: x,
					clientY: y,
					dataTransfer,
				}),
			);
		}
	}, point);
}

test.describe("PRD 0012 — grid, tool strip, uploads (FR-112/FR-010/FR-091..093)", () => {
	test("tool strip: rail tools activate; no overflow without extension tools (FR-010)", async ({
		page,
	}) => {
		await gotoCanvas(page, "e2e-strip");
		const strip = page.getByTestId("tool-strip");
		await expect(strip).toBeVisible();
		// Built-in rail buttons carry shortcut tooltips and activate on click.
		await expect(page.getByTestId("tool-strip-select")).toBeVisible();
		await page.getByTestId("tool-strip-rect").click();
		await expect(page.getByTestId("tool-strip-rect")).toHaveAttribute(
			"data-active",
			"true",
		);
		// Drawing with the strip-activated tool works end to end.
		const box = await stageBox(page);
		const from = atStage(box, 0.15, 0.15);
		const to = atStage(box, 0.4, 0.35);
		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		await page.mouse.move(to.x, to.y, { steps: 8 });
		await page.mouse.up();
		await expect
			.poll(async () => (await readScene(page)).count)
			.toBeGreaterThan(0);
		// This mount registers no extension tools — no "More tools" overflow.
		await expect(page.getByTestId("tool-strip-more")).toHaveCount(0);
	});

	test("tool strip: every built-in tool activates from the rail (cp3-009)", async ({
		page,
	}) => {
		// cp3-009 deleted the Elements panel's drawing-tool grid, which is where
		// eight specs used to reach the tools. The rail is now the ONLY built-in
		// tool surface, so "all 14 are reachable and activatable from it" has to
		// be asserted somewhere — this is that assertion. The id list mirrors
		// `BuiltinToolId` (canvas-editor `src/stores/tool-store.ts`) in rail order
		// (`TOOL_RAIL_ITEMS`, `src/chrome/icons.ts`); a tool added there without a
		// rail entry fails the count check below.
		await gotoCanvas(page, "e2e-strip-all-tools");
		const strip = page.getByTestId("tool-strip");
		await expect(strip).toBeVisible();

		const builtinToolIds = [
			"select",
			"text",
			"rich-text",
			"frame",
			"rect",
			"ellipse",
			"polygon",
			"star",
			"line",
			"path",
			"image",
			"hand",
			"ai-image",
			"ai-brush",
		] as const;

		// The rail renders exactly the built-ins — no more, no fewer.
		await expect(strip.locator("[data-testid^='tool-strip-']")).toHaveCount(
			builtinToolIds.length,
		);

		for (const id of builtinToolIds) {
			const button = page.getByTestId(`tool-strip-${id}`);
			await expect(button).toBeVisible();
			// The image tool is gated on picker availability; this route wires
			// `onPickAsset`, so every rail button must be enabled here.
			await expect(button).toBeEnabled();
			await button.click();
			await expect(button).toHaveAttribute("data-active", "true");
			await expect(button).toHaveAttribute("aria-pressed", "true");
		}

		// Leave the mount on Select so the serial file's later tests start clean.
		await page.getByTestId("tool-strip-select").click();
		await expect(page.getByTestId("tool-strip-select")).toHaveAttribute(
			"data-active",
			"true",
		);
	});

	test("grid: context-menu toggles + settings dialog write viewport state (FR-112)", async ({
		page,
	}) => {
		await gotoCanvas(page, "e2e-grid");
		const box = await stageBox(page);
		const at = atStage(box, 0.5, 0.5);
		await page.mouse.click(at.x, at.y, { button: "right" });
		// Distinct visibility vs snap controls (FR-112 separation).
		await expect(page.getByTestId("ctx-toggle-grid")).toBeVisible();
		await expect(page.getByTestId("ctx-snap-grid")).toBeVisible();
		await expect(page.getByTestId("ctx-snap-objects")).toBeVisible();
		// Open the settings dialog.
		await page.getByTestId("ctx-grid-settings").click();
		const dialog = page.getByTestId("grid-settings-dialog");
		await expect(dialog).toBeVisible();
		// Change the grid size and subdivisions; the dialog writes straight to
		// the viewport store (no history entries — undo stays empty).
		await page.getByTestId("grid-settings-size").fill("16");
		await page.getByTestId("grid-settings-subdivisions").fill("4");
		await page.getByTestId("grid-settings-close").click();
		await expect(dialog).toHaveCount(0);
		// Re-open: values persisted in the store.
		await page.mouse.click(at.x, at.y, { button: "right" });
		await page.getByTestId("ctx-grid-settings").click();
		await expect(page.getByTestId("grid-settings-size")).toHaveValue("16");
		await page.getByTestId("grid-settings-close").click();
		// Toggle the grid off and on through the context menu.
		await page.mouse.click(at.x, at.y, { button: "right" });
		await page.getByTestId("ctx-toggle-grid").click();
		await page.mouse.click(at.x, at.y, { button: "right" });
		await expect(page.getByTestId("ctx-toggle-grid")).toBeVisible();
		await page.keyboard.press("Escape");
	});

	test("axe: grid settings dialog has no serious violations (AC-012)", async ({
		page,
	}) => {
		await gotoCanvas(page, "e2e-grid-axe");
		const box = await stageBox(page);
		const at = atStage(box, 0.5, 0.5);
		await page.mouse.click(at.x, at.y, { button: "right" });
		await page.getByTestId("ctx-grid-settings").click();
		await expect(page.getByTestId("grid-settings-dialog")).toBeVisible();
		await page.evaluate(axeCoreSource);
		const violations = await page.evaluate(async () => {
			const axe = (
				window as unknown as {
					axe: {
						run: (
							context: Document,
							options: Record<string, unknown>,
						) => Promise<{
							violations: {
								id: string;
								impact: string;
								description: string;
							}[];
						}>;
					};
				}
			).axe;
			const results = await axe.run(document, {
				runOnly: {
					type: "tag",
					values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
				},
				rules: { "color-contrast": { enabled: false } },
				iframes: false,
			});
			return results.violations;
		});
		const serious = violations.filter(
			(v) => v.impact === "serious" || v.impact === "critical",
		);
		expect(
			serious.map((v) => `[${v.impact}] ${v.id}: ${v.description}`),
		).toEqual([]);
	});

	test("upload: drop inserts and shows a done task; drop on the image replaces instead (FR-091/092/093)", async ({
		page,
	}) => {
		await gotoCanvas(page, "e2e-upload");
		// Open the uploads dock so task status is observable.
		await page.getByTestId("panel-dock-uploads").click();
		const box = await stageBox(page);

		// 1. Drop a file on empty canvas → one node inserted, task done.
		await dropFileAt(page, atStage(box, 0.3, 0.3));
		await expect
			.poll(async () => (await readScene(page)).count, { timeout: 30_000 })
			.toBe(1);
		await expect(
			page.locator('[data-testid^="upload-task-"][data-status="done"]'),
		).toHaveCount(1, { timeout: 30_000 });

		// 2. Drop a second file ON the inserted image → REPLACE, not insert:
		// node count stays 1 while a second done task appears.
		await dropFileAt(page, atStage(box, 0.3, 0.3));
		await expect(
			page.locator('[data-testid^="upload-task-"][data-status="done"]'),
		).toHaveCount(2, { timeout: 30_000 });
		expect((await readScene(page)).count).toBe(1);

		// 3. Drop on empty space again → inserts (count grows to 2).
		await dropFileAt(page, atStage(box, 0.75, 0.75));
		await expect
			.poll(async () => (await readScene(page)).count, { timeout: 30_000 })
			.toBe(2);
	});

	test("responsive: the workspace stays usable at 1024px (AC-012)", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1024, height: 768 });
		await gotoCanvas(page, "e2e-1024");
		// Inspector auto-collapses in the narrow range; shell + strip remain.
		await expect(page.getByTestId("workspace-inspector")).toHaveAttribute(
			"data-collapsed",
			"true",
		);
		await expect(page.getByTestId("tool-strip")).toBeVisible();
		await expect(page.getByTestId("workspace-footer")).toBeVisible();
		// No horizontal overflow: the shell fits the viewport.
		const overflow = await page.evaluate(
			() =>
				document.documentElement.scrollWidth -
				document.documentElement.clientWidth,
		);
		expect(overflow).toBeLessThanOrEqual(0);
		// Basic editing still works: activate a tool from the strip and draw.
		await page.getByTestId("tool-strip-rect").click();
		const box = await stageBox(page);
		const from = atStage(box, 0.2, 0.2);
		const to = atStage(box, 0.5, 0.45);
		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		await page.mouse.move(to.x, to.y, { steps: 8 });
		await page.mouse.up();
		await expect
			.poll(async () => (await readScene(page)).count)
			.toBeGreaterThan(0);
	});
});
