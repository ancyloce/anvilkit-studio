import { expect, type Page, test } from "@playwright/test";
import {
	findDesignBlockNodeId,
	gotoEditor,
	insertDesignBlockAndCommitPreview,
	openCanvasForNode,
} from "./design-block-preview.helpers";

/**
 * PRD §9.2 scenarios 8 (DesignBlock ↔ canvas overlay) and 9 (mode-switch
 * continuity), on the Puck editor route (`/puck/editor`), where the
 * `@anvilkit/plugin-canvas-studio` plugin registers an "Open Canvas" header
 * action + a viewport overlay (`canvas-mode-overlay`).
 *
 * #8 drives the full insert → open-canvas → commit → preview flow. The Konva
 * `<Stage>` renders headless thanks to the `--disable-gpu`
 * /`--disable-software-rasterizer` launch args in playwright.config.ts (plain
 * headless hangs on GPU; these flags render fine — the earlier "Stage does not
 * render under React 19/Next 16" claim is stale, see the resolved
 * CanvasStage StrictMode-destroy fix).
 *
 * UNBLOCKED 2026-07-17 (#9 was `test.fixme` pending its own reopen-flow
 * rewrite — NOT the Konva claim above, which never applied to it). Its
 * original body only checked the DesignBlock preview's visibility twice,
 * which passes trivially without ever proving state survives a close→reopen
 * round trip. The rewrite below draws a real shape on the SECOND open, closes,
 * reopens the SAME linked design a third time, and asserts the shape is still
 * there — the thing the test's title actually claims.
 */
test.describe.configure({ mode: "serial", timeout: 240_000 });

/** Stage coordinates as FRACTIONS of the stage box (0..1), ported from
 * `editor-core.spec.ts` — the overlay's stage is zoom-to-fit like the
 * standalone route's. */
function atStage(
	box: { x: number; y: number; width: number; height: number },
	fx: number,
	fy: number,
) {
	return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

/** Draw one rectangle on the currently-open canvas overlay's stage. */
async function drawRectOnOverlay(page: Page): Promise<void> {
	await page.getByTestId("panel-dock-elements").click();
	await page.getByTestId("elements-tool-rect").click();
	const canvas = page
		.locator(
			'[data-testid="canvas-mode-overlay"] [data-testid="pages-canvas"] canvas',
		)
		.first();
	const box = await canvas.boundingBox();
	if (!box) throw new Error("overlay stage canvas not found");
	const from = atStage(box, 0.15, 0.15);
	const to = atStage(box, 0.55, 0.45);
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(to.x, to.y, { steps: 10 });
	await page.mouse.up();
}

test.describe("Canvas Studio — Puck bridge (PRD §9.2)", () => {
	test("plugin-canvas-studio registers the Open Canvas header action", async ({
		page,
	}) => {
		// Proves the canvas-studio plugin mounted into <Studio> and contributed its
		// mode-switch header action. Presence is the assertion (the overlay-open
		// flow is exercised by #8).
		await gotoEditor(page);
		await expect(
			page.getByRole("button", { name: "Open Canvas" }),
		).toBeVisible();
	});

	test("#8 DesignBlock overlay save renders a preview asset", async ({
		page,
	}) => {
		await gotoEditor(page);

		// Insert a DesignBlock, edit + commit on the canvas (see the helper for the
		// quick-add insert and the open-event node linkage).
		const frame = await insertDesignBlockAndCommitPreview(page);

		// Back on the page, the block renders its exported preview asset (the
		// `<figure>`/`<img>`) in place of the empty state. The preview source is a
		// `blob:` object URL — asserted specifically in
		// `preview-object-url.verify.spec.ts`.
		const block = frame.getByTestId("design-block");
		await expect(block).toBeVisible({ timeout: 20_000 });
		await expect(block.locator("img")).toHaveAttribute("src", /\S/);
		await expect(frame.getByTestId("design-block-empty")).toBeHidden();
	});

	test("#9 mode-switch canvas → puck → canvas preserves design state", async ({
		page,
	}) => {
		await gotoEditor(page);

		// Round 1: insert → open → commit (empty design, writes a preview +
		// designId — same flow #8 exercises).
		const frame = await insertDesignBlockAndCommitPreview(page);
		await expect(frame.getByTestId("design-block")).toBeVisible();

		// Round 2: reopen the SAME linked node (its designId now persists via
		// the mode-store + localStorage adapter after round 1's commit), draw a
		// real shape, and commit again.
		const puckNodeId = await findDesignBlockNodeId(page);
		await openCanvasForNode(page, puckNodeId);
		await drawRectOnOverlay(page);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("1");
		await page.getByTestId("workspace-back").click();
		await expect(page.getByTestId("canvas-mode-overlay")).toBeHidden({
			timeout: 15_000,
		});

		// Round 3: reopen the SAME linked design again — THIS is the actual
		// "preserves design state" claim: the shape drawn in round 2 must still
		// be there, proving the adapter round-tripped the IR, not just that the
		// overlay opened.
		await openCanvasForNode(page, puckNodeId);
		await expect(page.getByTestId("canvas-node-count")).toHaveText("1");
	});
});
