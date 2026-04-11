/**
 * @file Phase 3 M0 smoke test — the "hello world" of the demo's
 * Playwright harness.
 *
 * This spec exists to prove the harness boots, loads `/puck/editor`,
 * lets Next.js hydrate the client `<Studio>` tree, and observes
 * the `smokeTestPlugin`'s `onInit` console log. If this fails, every
 * downstream Phase 3 E2E (`phase3-014`) would also fail — so this
 * test is the canary that tells us "is the harness even functional?"
 *
 * Why a console assertion?
 *   `smokeTestPlugin.onInit` fires inside a `useEffect` in
 *   `<Studio>` (see `packages/core/src/react/components/Studio.tsx`
 *   L413-L418). That means the log only appears after:
 *     1. Server render lands.
 *     2. Next hydrates the client bundle.
 *     3. `<Studio>` mounts, compiles plugins, fires `onInit`.
 *     4. `smokeTestPlugin` writes `[smoke] onInit` to the browser
 *        console.
 *   Observing it proves the full SSR → hydrate → plugin pipeline is
 *   wired end-to-end.
 *
 * Why `page.on("console", …)` before `page.goto()`?
 *   Playwright's console listener only captures messages emitted
 *   AFTER it's attached. Registering after navigation would race
 *   against the plugin's own `onInit` call and flake.
 *
 * @see {@link file://./../../../docs/tasks/phase3-001-playwright-setup.md | phase3-001}
 * @see {@link file://./../lib/smoke-test-plugin.ts | smokeTestPlugin}
 */

import { expect, test } from "@playwright/test";

test("editor page mounts and smoke plugin fires onInit", async ({ page }) => {
	const consoleMessages: string[] = [];
	const pageErrors: string[] = [];
	const failedRequests: string[] = [];

	// Attach BEFORE navigation so we don't miss the initial `onInit`
	// log that fires as soon as `<Studio>` hydrates. We also capture
	// `pageerror` and `requestfailed` so a hydration crash or a 404
	// on a chunk surfaces as a real diagnostic instead of an opaque
	// timeout.
	page.on("console", (msg) => {
		consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
	});
	page.on("pageerror", (err) => {
		pageErrors.push(err.stack ?? err.message);
	});
	page.on("requestfailed", (req) => {
		failedRequests.push(
			`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? "unknown"}`,
		);
	});

	await page.goto("/puck/editor");

	// Poll for up to 10 s after navigation. On warm runs the log
	// appears within ~1.5 s; 10 s is the task spec's documented
	// upper bound for cold client hydration. The `webServer.timeout`
	// in `playwright.config.ts` covers the Next dev-mode cold
	// compile separately.
	await expect
		.poll(
			() => consoleMessages.some((text) => text.includes("[smoke] onInit")),
			{
				timeout: 10_000,
				message: [
					"Expected smokeTestPlugin to log '[smoke] onInit' after hydration.",
					`Console (last 20): ${JSON.stringify(consoleMessages.slice(-20))}`,
					`Page errors: ${JSON.stringify(pageErrors)}`,
					`Failed requests: ${JSON.stringify(failedRequests)}`,
				].join("\n"),
			},
		)
		.toBe(true);
});
