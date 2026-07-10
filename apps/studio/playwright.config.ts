/**
 * Playwright configuration for `apps/studio`.
 *
 * This file is the only E2E harness in the workspace. It boots the
 * demo's Next.js dev server (`pnpm dev`) automatically via Playwright's
 * `webServer` option, runs specs under `./e2e`, and targets Chromium
 * only for the v0.1 release (see `docs/plans/phase-3-export-ai-pipeline-plan.md`
 * §10 Q5 — Firefox/WebKit are Phase 4 polish).
 *
 * Implementation notes:
 *   - `webServer.command` is `pnpm dev`, not `pnpm build && pnpm start`.
 *     The goal is fast feedback; a production build for a smoke test
 *     is overkill. Cold starts under `next dev --webpack` in this
 *     workspace take 60-90 s to first 200 response (observed in WSL2
 *     local runs), so `timeout` is set to 180 s for headroom.
 *   - `reuseExistingServer` is true locally so repeated `pnpm e2e`
 *     runs attach to an already-running `pnpm dev`. In CI it is
 *     false so every job gets a clean boot.
 *   - `reporter` is `"github"` in CI (annotation lines surface in the
 *     PR check output) and `"list"` locally (streamed terminal output).
 *   - Default test timeout is Playwright's 30 s per spec — no override
 *     here. Per-test waits (`expect.poll`) use their own shorter
 *     timeouts inside specs.
 *
 * @see {@link https://playwright.dev/docs/test-configuration | Playwright config docs}
 * @see {@link file://./../../docs/tasks/phase3-001-playwright-setup.md | phase3-001}
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: "http://localhost:3000",
		trace: "on-first-retry",
		// Force CPU rasterization. Konva's 2D-canvas rendering (Canvas Studio route)
		// hard-locks the main thread on mount under headless Chromium's GPU/
		// SwiftShader path on this WSL2 box (verified: headed-under-xvfb renders
		// fine, plain headless hangs, headless + these flags renders fine). Not a
		// product bug — the editor works in real browsers; this is a headless
		// rasterizer artifact. CPU-only 2D canvas is plenty for these specs.
		launchOptions: {
			args: ["--disable-gpu", "--disable-software-rasterizer"],
		},
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: [
		{
			command: "pnpm dev",
			url: "http://localhost:3000",
			reuseExistingServer: !process.env.CI,
			timeout: 180_000,
			// Pin the page store to the ephemeral in-memory backend for E2E: the
			// runtime default is now `sqlite` (durable), but tests assert on the
			// client-seeded rail + per-run state, so memory keeps runs hermetic
			// and fast and avoids the native better-sqlite3 addon in CI.
			env: { ANVILKIT_PAGE_STORAGE: "memory" },
		},
		{
			// y-websocket reference relay for the cross-tab `collab.spec.ts`
			// scenario. The plugin-collab-yjs submodule ships the script
			// under examples/. Other suites do not depend on it; the
			// command is cheap to boot (<200 ms) so always running it
			// keeps the matrix simple.
			//
			// Port 21234 (not 1234 or 11234) sidesteps WSL2 binding leaks
			// and Windows-host port reservations (Hyper-V dynamic exclusion
			// ranges can include both 1234 and 11234 depending on the
			// machine, surfacing as a misleading EADDRINUSE even when
			// `/proc/net/tcp*` is empty). Keep in sync with the
			// `COLLAB_RELAY_PORT` default in `apps/studio/scripts/dev-collab.mjs`.
			command:
				"node ../../packages/extensions/plugins/plugin-collab-yjs/examples/y-websocket-server.mjs 21234",
			url: "http://localhost:21234",
			reuseExistingServer: !process.env.CI,
			timeout: 30_000,
		},
	],
});
