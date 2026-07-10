/**
 * @file M12 / phase6-017 — presence layer smoke test.
 *
 * Asserts that the demo editor mounts the `<PresenceLayer>` from
 * `@anvilkit/ui/presence` when `?collab=1` is set, and that the
 * collab plugin instantiates without console errors. Also covers the
 * cross-tab two-session flow over the y-websocket reference relay
 * that Playwright boots automatically via the `webServer` entry in
 * `playwright.config.ts` (port 21234).
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

test("editor does NOT mount presence layer with ?collab=0 (opt-out)", async ({
	page,
}) => {
	// Collaboration is ON by default in the showcase editor; `?collab=0` opts
	// out, so the presence layer must not mount.
	await page.goto("/puck/editor?collab=0");
	const studioMount = page.getByTestId("studio-mount");
	await expect(studioMount).toBeVisible();
	await expect(studioMount).toHaveAttribute("data-collab", "0");
	await expect(page.locator("[data-slot=presence-layer]")).toHaveCount(0);
});

test.describe("two-session sync over the y-websocket relay", () => {
	test("both sessions mount the presence layer against the same room", async ({
		browser,
	}) => {
		const ctxA = await browser.newContext();
		const ctxB = await browser.newContext();
		const pageA = await ctxA.newPage();
		const pageB = await ctxB.newPage();
		const room = `presence-spec-${Date.now()}`;
		await pageA.goto(
			`/puck/editor?collab=1&peer=alice&room=${room}&relay=ws&relayPort=21234`,
		);
		await pageB.goto(
			`/puck/editor?collab=1&peer=bob&room=${room}&relay=ws&relayPort=21234`,
		);

		await expect(pageA.getByTestId("studio-mount")).toBeVisible();
		await expect(pageB.getByTestId("studio-mount")).toBeVisible();

		await expect(pageA.locator("[data-slot=presence-layer]")).toBeAttached();
		await expect(pageB.locator("[data-slot=presence-layer]")).toBeAttached();

		// Push a cursor update from A; the relay-backed awareness lets B
		// pick it up. We just assert both layers are alive — finer-grain
		// cursor-position assertions live in `collab.spec.ts`.
		await pageA.mouse.move(200, 300);

		await ctxA.close();
		await ctxB.close();
	});
});
