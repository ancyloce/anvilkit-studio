/**
 * Playwright configuration for `apps/demo`.
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
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: "pnpm dev",
		url: "http://localhost:3000",
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
	},
});
