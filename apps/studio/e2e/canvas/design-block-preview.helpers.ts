import { expect, type FrameLocator, type Page } from "@playwright/test";

/**
 * Shared driver for the DesignBlock ↔ canvas-overlay preview flow, used by both
 * `puck-bridge.spec.ts` (#8) and `preview-object-url.verify.spec.ts`. Kept in a
 * non-`.spec` file so Playwright's default testMatch does not run it as a suite.
 */

const OVERLAY = '[data-testid="canvas-mode-overlay"]';

/** Navigate to the Puck editor and wait for hydration (vertical rail tablist). */
export async function gotoEditor(page: Page): Promise<void> {
	await page.goto("/puck/editor");
	// The editor cold-compile can take ~30s on a fresh server.
	await expect(
		page.locator('[role="tablist"][aria-orientation="vertical"]'),
	).toBeVisible({ timeout: 60_000 });
}

async function waitForStage(page: Page): Promise<void> {
	await expect(page.locator(OVERLAY)).toBeVisible({ timeout: 30_000 });
	// The Konva stage renders a real <canvas> once the overlay's lazy chunk loads.
	await expect(page.locator(`${OVERLAY} canvas`).first()).toBeVisible({
		timeout: 45_000,
	});
}

/**
 * Resolve the (currently sole) Design Block layer row's Puck node id, the
 * same lookup {@link insertDesignBlockAndCommitPreview} uses internally —
 * extracted so a caller can re-resolve it after a commit (e.g. to reopen the
 * same linked design a second time) without re-inserting a block.
 */
export async function findDesignBlockNodeId(page: Page): Promise<string> {
	const row = page
		.getByTestId("ak-layer-layers")
		.locator('[data-testid^="ak-layer-node-"]')
		.filter({ hasText: "Design Block" })
		.first();
	const testid = await row.getAttribute("data-testid");
	const puckNodeId = (testid ?? "").replace("ak-layer-node-", "");
	expect(puckNodeId.length, "resolved a Puck node id").toBeGreaterThan(0);
	return puckNodeId;
}

/**
 * Fire the plugin's public `CANVAS_OPEN_EVENT` for a specific node and wait
 * for the stage to paint. `designId` is deliberately left empty — the
 * listener resolves the design from the node's OWN current props (its
 * persisted `design://` ref after a prior commit, or a fresh one when
 * unlinked), the same intent the in-block affordance dispatches.
 */
export async function openCanvasForNode(
	page: Page,
	puckNodeId: string,
): Promise<void> {
	await page.evaluate((nodeId) => {
		window.dispatchEvent(
			new CustomEvent("anvilkit-canvas:open", {
				detail: { designId: "", puckNodeId: nodeId, artboardId: null },
			}),
		);
	}, puckNodeId);
	await waitForStage(page);
}

/**
 * Insert a DesignBlock, open it on the canvas, and commit — leaving the block
 * showing its exported preview. Returns the editor preview `FrameLocator`
 * (Puck renders components inside `iframe#preview-frame`). Assumes the caller is
 * already on `/puck/editor` (call {@link gotoEditor} first).
 *
 * Insertion uses the Layers quick-add (a deterministic Puck `insert` dispatch —
 * Playwright drag-to-insert is unreliable here). The quick-add also auto-opens
 * the canvas against a fresh, UNLINKED design, which we close first. A freshly
 * inserted block has an empty `designId`, so the "Open Canvas" header action
 * cannot link it (`defaultResolveTarget` returns a null `puckNodeId`); instead
 * we fire the plugin's public `CANVAS_OPEN_EVENT` on the top window carrying the
 * block's real node id — the same intent the in-block affordance dispatches,
 * issued here to skip the iframe→parent hop. That node id is what wires the
 * preview patch (`design://` ref + object-URL store seed) on commit.
 */
export async function insertDesignBlockAndCommitPreview(
	page: Page,
): Promise<FrameLocator> {
	await page
		.locator('[data-testid="ak-rail-tab-layer"], #ak-rail-tab-layer')
		.first()
		.click();
	// The Pages & Layers module defaults its inner sub-tab to "Pages"
	// (`layerPanelMode` default in editor-ui-store.ts) — `LayersPanel` (and
	// its Insert-layer button) only mounts under the "Layers" sub-tab.
	await page.getByTestId("ak-layer-tab-layers").click();
	await page.getByTestId("ak-layer-layers-add").click();
	await expect(page.getByTestId("ak-layer-quickadd-popup")).toBeVisible({
		timeout: 10_000,
	});
	await page
		.getByRole("menuitem", { name: /design block/i })
		.first()
		.click();

	// Close the quick-add's auto-opened (unlinked) overlay.
	await waitForStage(page);
	await page.getByTestId("workspace-back").click();
	await expect(page.locator(OVERLAY)).toBeHidden({ timeout: 15_000 });

	const frame = page.frameLocator("#preview-frame");
	await expect(frame.getByTestId("design-block-empty")).toBeVisible({
		timeout: 20_000,
	});

	// Reopen the canvas FOR THIS node via the plugin's open event.
	const puckNodeId = await findDesignBlockNodeId(page);
	await openCanvasForNode(page, puckNodeId);

	// Wait for the stage to paint, then commit + close.
	await page.waitForTimeout(1000);
	await page.getByTestId("workspace-back").click();

	return frame;
}
