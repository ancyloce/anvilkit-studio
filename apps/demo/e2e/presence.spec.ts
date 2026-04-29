/**
 * @file M12 / phase6-017 — presence layer smoke test.
 *
 * Asserts that the demo editor mounts the `<PresenceLayer>` from
 * `@anvilkit/ui/presence` when `?collab=1` is set, and that the
 * collab plugin instantiates without console errors.
 *
 * The cross-tab two-session flow that proves "an edit in session A
 * appears in session B within 500 ms over the y-websocket reference
 * relay" is gated behind the `RUN_COLLAB_E2E` env var because it
 * requires the y-websocket relay (under
 * `packages/plugins/plugin-collab-yjs/examples/y-websocket-server.mjs`)
 * to be running. CI does not currently spawn the relay; the alpha
 * channel framing in `docs/architecture/realtime-collab.md` covers
 * the manual verification path.
 */

import { expect, test } from "@playwright/test";

test("editor mounts the presence layer when ?collab=1 is set", async ({
	page,
}) => {
	const consoleErrors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") consoleErrors.push(msg.text());
	});

	await page.goto("/puck/editor?collab=1&peer=alice");

	const studioMount = page.getByTestId("studio-mount");
	await expect(studioMount).toBeVisible();
	await expect(studioMount).toHaveAttribute("data-collab", "1");

	const presenceLayer = page.locator("[data-slot=presence-layer]");
	await expect(presenceLayer).toBeAttached();

	// Move the mouse to push our local cursor through the awareness
	// channel. With no transport this only updates the local doc, but
	// it still proves the wiring works end-to-end without tripping
	// React effects or breaking hydration.
	await page.mouse.move(120, 240);
	await page.mouse.move(480, 360);

	expect(consoleErrors.filter((e) => !e.includes("[next]"))).toEqual([]);
});

test("editor does NOT mount presence layer without ?collab=1", async ({
	page,
}) => {
	await page.goto("/puck/editor");
	const studioMount = page.getByTestId("studio-mount");
	await expect(studioMount).toBeVisible();
	await expect(studioMount).toHaveAttribute("data-collab", "0");
	await expect(page.locator("[data-slot=presence-layer]")).toHaveCount(0);
});

test.describe("two-session sync (gated)", () => {
	test.skip(
		!process.env.RUN_COLLAB_E2E,
		"set RUN_COLLAB_E2E=1 with a y-websocket relay running on ws://localhost:1234",
	);

	test("an edit in session A is observable in session B (manual)", async ({
		browser,
	}) => {
		const ctxA = await browser.newContext();
		const ctxB = await browser.newContext();
		const pageA = await ctxA.newPage();
		const pageB = await ctxB.newPage();
		await pageA.goto("/puck/editor?collab=1&peer=alice");
		await pageB.goto("/puck/editor?collab=1&peer=bob");

		await expect(pageA.getByTestId("studio-mount")).toBeVisible();
		await expect(pageB.getByTestId("studio-mount")).toBeVisible();

		await pageA.mouse.move(200, 300);

		// Without the relay the cursors don't actually sync; this
		// scaffold is here so a maintainer who runs the relay can
		// extend the spec into a real assertion against the remote
		// peer's cursor.
		await pageB.locator("[data-slot=presence-layer]").waitFor();

		await ctxA.close();
		await ctxB.close();
	});
});
