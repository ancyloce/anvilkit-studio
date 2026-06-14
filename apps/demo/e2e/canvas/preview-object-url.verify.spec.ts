import { expect, test } from "@playwright/test";

/**
 * Runtime verification (not a committed contract): after a canvas commit, the
 * DesignBlock in the Puck editor renders its preview from the plugin's
 * object-URL store — i.e. the `<img src>` is a `blob:` URL, NOT an inlined data
 * URL in the node props and NOT the raw `design://` reference. Proves the
 * "previews → object-URL store" change end-to-end in the real editor.
 */
test.describe.configure({ timeout: 240_000 });

const SHOT = process.env.SHOT_PATH ?? "preview-verify.png";
const overlay = '[data-testid="canvas-mode-overlay"]';

test("DesignBlock preview renders from the object-URL store after a canvas commit", async ({
	page,
}) => {
	// 1. Editor + hydration (vertical rail tablist is the hydration signal).
	await page.goto("/puck/editor");
	await expect(
		page.locator('[role="tablist"][aria-orientation="vertical"]'),
	).toBeVisible({ timeout: 60_000 });

	// 2. Insert a DesignBlock via the Layers quick-add. (It also auto-opens the
	//    canvas against a fresh, UNLINKED design — close that first.)
	await page
		.locator('[data-testid="ak-rail-tab-layer"], #ak-rail-tab-layer')
		.first()
		.click();
	await page.getByTestId("ak-layer-layers-add").click();
	await expect(page.getByTestId("ak-layer-quickadd-popup")).toBeVisible({
		timeout: 10_000,
	});
	await page
		.getByRole("menuitem", { name: /design block/i })
		.first()
		.click();
	await expect(page.locator(overlay)).toBeVisible({ timeout: 30_000 });
	await expect(page.locator(`${overlay} canvas`).first()).toBeVisible({
		timeout: 45_000,
	});
	await page.getByTestId("workspace-back").click();
	await expect(page.locator(overlay)).toBeHidden({ timeout: 15_000 });

	// 3. The inserted block shows the empty state inside Puck's preview iframe.
	const frame = page.frameLocator("#preview-frame");
	await expect(frame.getByTestId("design-block-empty")).toBeVisible({
		timeout: 20_000,
	});

	// 4. Read the block's Puck node id from its layer row, then open the canvas
	//    FOR THAT NODE by firing the plugin's open event on the top window — the
	//    same event the in-block affordance fires, dispatched here to skip the
	//    iframe→parent hop. This drives the real plugin open→commit→patch path
	//    that writes a `design://` ref + seeds the object-URL store.
	const row = page
		.getByTestId("ak-layer-layers")
		.locator('[data-testid^="ak-layer-node-"]')
		.filter({ hasText: "Design Block" })
		.first();
	const testid = await row.getAttribute("data-testid");
	const puckNodeId = (testid ?? "").replace("ak-layer-node-", "");
	expect(puckNodeId.length, "resolved a Puck node id").toBeGreaterThan(0);

	await page.evaluate((nodeId) => {
		window.dispatchEvent(
			new CustomEvent("anvilkit-canvas:open", {
				detail: { designId: "", puckNodeId: nodeId, artboardId: null },
			}),
		);
	}, puckNodeId);

	// 5. Overlay reopens for this node; wait for the stage to paint, then commit.
	await expect(page.locator(overlay)).toBeVisible({ timeout: 30_000 });
	await expect(page.locator(`${overlay} canvas`).first()).toBeVisible({
		timeout: 45_000,
	});
	await page.waitForTimeout(1000);
	await page.getByTestId("workspace-back").click();

	// 6. The empty state is replaced by the preview figure...
	await expect(frame.getByTestId("design-block")).toBeVisible({
		timeout: 20_000,
	});
	const img = frame.getByTestId("design-block").locator("img");
	await expect(img).toBeVisible();

	// ...and its src is a blob: object URL from the store (the change under test).
	const src = await img.getAttribute("src");
	console.log(`[verify] design-block <img> src prefix: ${src?.slice(0, 48)}`);
	expect(src, "preview <img> must have a src").toBeTruthy();
	expect(
		src?.startsWith("blob:"),
		`expected a blob: object URL, got: ${src?.slice(0, 64)}`,
	).toBe(true);

	await page.screenshot({ path: SHOT, fullPage: true });
});
