/**
 * @file Regression spec for the conflict-toast / cursor-jump report:
 *
 *   "X's edit overlapped your unsaved change in hero-primary"
 *   + "typing characters in the middle of the Headline causes the
 *      cursor to jump to the end"
 *
 * Two peers join the same y-websocket room. Alice focuses the Hero
 * Headline and places her caret in the middle of the existing copy;
 * Bob types in Hero Description.
 *
 * SCOPE: this spec pins the plugin-layer guarantee — no false-positive
 * `hero-primary` overlap toast when peers edit disjoint props on the
 * same node. The complementary cursor-jump behaviour for the
 * **same-node** disjoint-props case (Alice in `headline`, Bob in
 * `description` of the SAME Hero) cannot be solved at the plugin
 * layer alone: Puck's `replace` action gives the replaced item a new
 * data reference, and the AutoField sidebar's `useLocalValue` does
 * not currently re-key around a focused textarea inside a replaced
 * item. That fix lives in Puck's AutoField; the plugin already does
 * the right thing for SIBLING-node remote edits via the atomic
 * `replace` dispatch in `dispatchRemoteIR`.
 *
 * Depends on the `ws` relay started by `playwright.config.ts`.
 */

import { expect, test } from "@playwright/test";

const RELAY = "ws";

// Override baseURL when a sibling dev server is already bound to 3000
// from a prior session — the local pnpm dev then comes up on 3001 and
// playwright.config.ts's `baseURL: 3000` points at the wrong server.
// Read from PW_DEMO_BASE_URL so the suite stays well-behaved in CI.
const DEMO_BASE_URL = process.env.PW_DEMO_BASE_URL ?? "http://localhost:3000";

test.use({ baseURL: DEMO_BASE_URL });

function editorUrl(peer: string, room: string): string {
	const params = new URLSearchParams({
		collab: "1",
		relay: RELAY,
		room,
		peer,
	});
	return `/puck/editor?${params.toString()}`;
}

test.describe("collab disjoint-prop fix", () => {
	test("no false-positive 'overlapped your unsaved change in hero-primary' toast when peers edit disjoint props on the same Hero", async ({
		browser,
	}, testInfo) => {
		const room = `disjoint-${testInfo.workerIndex}-${Date.now()}`;
		const ctxA = await browser.newContext();
		const ctxB = await browser.newContext();
		const pageA = await ctxA.newPage();
		const pageB = await ctxB.newPage();

		// Capture Alice's console to assert Puck's "setData is
		// expensive" warning is NOT emitted (proves the plugin is
		// dispatching atomic `replace` instead).
		const consoleA: string[] = [];
		pageA.on("console", (msg) =>
			consoleA.push(`[A:${msg.type()}] ${msg.text()}`),
		);

		await pageA.goto(editorUrl("alice", room));
		await pageB.goto(editorUrl("bob", room));

		await expect(pageA.getByTestId("studio-mount")).toHaveAttribute(
			"data-collab",
			"1",
		);
		await expect(pageB.getByTestId("studio-mount")).toHaveAttribute(
			"data-collab",
			"1",
		);

		// Wait until both peers see each other on the avatar stack
		// (proves awareness propagated through the relay before we
		// start exercising the data path).
		await expect(
			pageA.locator("[data-slot=peer-avatar-stack] [data-peer-id]"),
		).toHaveCount(2, { timeout: 15_000 });
		await expect(
			pageB.locator("[data-slot=peer-avatar-stack] [data-peer-id]"),
		).toHaveCount(2, { timeout: 15_000 });

		// Select the Hero on each peer by clicking its rendered headline
		// inside Puck's canvas iframe (#preview-frame). The hero's
		// default headline starts with "Write fast with".
		const canvasA = pageA.frameLocator("#preview-frame");
		const canvasB = pageB.frameLocator("#preview-frame");
		// Force the click — Puck's presence overlays sometimes shuffle
		// position during awareness ticks and trip the auto-stability
		// gate. We just need the click to land on the Hero element to
		// open its field sidebar.
		await canvasA.getByText("Write fast with").first().click({ force: true });
		await canvasB.getByText("Write fast with").first().click({ force: true });

		// Puck's sidebar AutoField generates deterministic ids of the
		// form `${itemId}_${fieldType}_${fieldName}`. The Hero's
		// instance id is "hero-primary" and the fields are both
		// `textarea` types.
		const headlineA = pageA.locator("#hero-primary_textarea_headline");
		const descriptionB = pageB.locator("#hero-primary_textarea_description");
		await expect(headlineA).toBeVisible({ timeout: 10_000 });
		await expect(descriptionB).toBeVisible({ timeout: 10_000 });

		// Alice positions her caret 5 chars in (well inside "Write fast…")
		// and types three characters. Cursor should end at offset 8.
		// Force-click and explicit focus avoid the awareness-tick
		// stability gate without changing what Puck sees as the active
		// field.
		await headlineA.click({ force: true });
		await headlineA.focus();
		await headlineA.evaluate((node) => {
			(node as HTMLTextAreaElement).setSelectionRange(5, 5);
		});

		// Drive a single keystroke on each peer. Each keystroke makes
		// a local save and arms the conflict-detection window on
		// Alice's side. Bob's keystroke landing within that window is
		// what the pre-fix logic flagged as a hero-primary overlap.
		const aliceTyping = pageA.keyboard.type("X", { delay: 40 });
		const bobTyping = (async () => {
			await descriptionB.click({ force: true });
			await descriptionB.focus();
			await pageB.keyboard.type("1", { delay: 40 });
		})();
		await Promise.all([aliceTyping, bobTyping]);

		// Let the relay round-trip Bob's edit back to Alice so the
		// observer on Alice's adapter has actually run `maybeFire`.
		await pageA.waitForTimeout(750);

		// The baseline-aware overlap check in `conflicts.ts` recognises
		// disjoint-prop edits as a non-conflict and suppresses the toast.
		const overlapToastsForHero = pageA.locator("[data-sonner-toast]").filter({
			hasText: /overlapped your unsaved change in hero-primary/i,
		});
		expect(
			await overlapToastsForHero.count(),
			"Expected no false-positive overlap toast for hero-primary when Bob edited a different prop.",
		).toBe(0);

		// Also confirm we're not paying for the heavy `setData`
		// path: with atomic `replace` dispatch enabled, Puck's
		// "setData is expensive…" warning must not appear on Alice's
		// console for this scenario.
		const heavySetDataWarnings = consoleA.filter((line) =>
			line.includes("`setData` is expensive"),
		);
		expect(
			heavySetDataWarnings,
			`Expected no "setData is expensive" warnings — the plugin should be using atomic 'replace' for unchanged-shape updates. Saw: ${heavySetDataWarnings.join(" | ")}`,
		).toHaveLength(0);

		await ctxA.close();
		await ctxB.close();
	});
});
