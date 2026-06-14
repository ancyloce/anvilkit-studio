import { expect, test } from "@playwright/test";
import {
	gotoEditor,
	insertDesignBlockAndCommitPreview,
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
 * CanvasStage StrictMode-destroy fix). #9 (mode-switch persistence) stays
 * `test.fixme` pending its own reopen-flow rewrite.
 */
test.describe.configure({ mode: "serial", timeout: 240_000 });

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

	test.fixme("#9 mode-switch canvas → puck → canvas preserves design state", async ({
		page,
	}) => {
		await gotoEditor(page);

		// Round 1: insert → open → commit (writes a preview + designId).
		const frame = await insertDesignBlockAndCommitPreview(page);
		await expect(frame.getByTestId("design-block")).toBeVisible();

		// Round 2: reopen the same design — state persists via the mode-store +
		// localStorage adapter (same designId, same IR). TODO: drive the reopen
		// against the now-linked node and assert IR continuity.
		await page.getByRole("button", { name: "Open Canvas" }).click();
		await expect(page.getByTestId("canvas-mode-overlay")).toBeVisible();
		await page.getByTestId("workspace-back").click();
		await expect(frame.getByTestId("design-block")).toBeVisible();
	});
});
