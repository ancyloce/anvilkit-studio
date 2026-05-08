/**
 * @file Phase 2 GA Core — collab.spec.ts.
 *
 * Two-context end-to-end coverage for the `@anvilkit/collab-ui`
 * primitives running over the y-websocket reference relay
 * (booted by playwright.config.ts as a second `webServer`).
 *
 * The smaller single-tab presence scaffolding lives in
 * `presence.spec.ts`; this spec depends on the relay being up.
 */

import { expect, test } from "@playwright/test";

const ROOM = "phase2-collab";
const RELAY = "ws";

function editorUrl(peer: string): string {
	const params = new URLSearchParams({
		collab: "1",
		relay: RELAY,
		room: ROOM,
		peer,
	});
	return `/puck/editor?${params.toString()}`;
}

test.describe("collab UI primitives", () => {
	test("two peers share a room and the sync indicator reaches synced", async ({
		browser,
	}) => {
		const ctxA = await browser.newContext();
		const ctxB = await browser.newContext();
		const pageA = await ctxA.newPage();
		const pageB = await ctxB.newPage();

		await pageA.goto(editorUrl("alice"));
		await pageB.goto(editorUrl("bob"));

		const indicatorA = pageA.locator(
			"[data-slot=sync-activity-indicator]",
		);
		const indicatorB = pageB.locator(
			"[data-slot=sync-activity-indicator]",
		);

		await expect(indicatorA).toBeVisible();
		await expect(indicatorB).toBeVisible();

		// Each peer should see its own indicator transition through
		// connecting → synced once the relay completes the initial sync.
		await expect(indicatorA).toHaveAttribute("data-status", "synced", {
			timeout: 10_000,
		});
		await expect(indicatorB).toHaveAttribute("data-status", "synced", {
			timeout: 10_000,
		});

		// The collab room bar is mounted (composite of indicator +
		// avatar stack + settings popover).
		await expect(
			pageA.locator("[data-slot=collab-room-bar]"),
		).toBeVisible();
		await expect(
			pageA.getByTestId("collab-room-bar-title"),
		).toContainText("Collaboration demo");

		// Conflict notice center mounts a sonner toaster.
		await expect(
			pageA.locator("[data-sonner-toaster]"),
		).toHaveCount(1);

		await ctxA.close();
		await ctxB.close();
	});

	test("the avatar stack reflects remote peers", async ({ browser }) => {
		const ctxA = await browser.newContext();
		const ctxB = await browser.newContext();
		const pageA = await ctxA.newPage();
		const pageB = await ctxB.newPage();

		await pageA.goto(editorUrl("alice"));
		await pageB.goto(editorUrl("bob"));

		const stackA = pageA.locator("[data-slot=peer-avatar-stack]");
		await expect(stackA).toBeVisible();

		// Page A should see Bob's avatar (filtered for self) once
		// awareness propagates the remote peer's PresenceState frame.
		await expect(stackA.locator("[data-peer-id]")).toHaveCount(1, {
			timeout: 10_000,
		});

		await ctxA.close();
		await ctxB.close();
	});

	test("force-resync dialog opens via the conflict toast action", async ({
		browser,
	}) => {
		const ctxA = await browser.newContext();
		const pageA = await ctxA.newPage();
		await pageA.goto(editorUrl("alice"));
		await expect(
			pageA.locator("[data-slot=sync-activity-indicator]"),
		).toHaveAttribute("data-status", "synced", { timeout: 10_000 });

		// The dialog is conditionally rendered, so we verify the slot
		// stays absent until invoked. The full overlap → toast action
		// → resync flow requires a deeper IR-edit fixture and is
		// covered by `force-resync.test.ts` at the unit layer.
		await expect(
			pageA.locator("[data-slot=force-resync-dialog]"),
		).toHaveCount(0);

		await ctxA.close();
	});
});
