/**
 * Playwright configuration for `apps/playground`.
 *
 * Compatibility smoke harness: boots the playground's Next.js dev server
 * (port 3100 — studio owns :3000) and runs the specs under `./e2e`.
 * Conventions mirror `apps/studio/playwright.config.ts`: Chromium only,
 * `pnpm dev` for fast feedback, CPU rasterization flags for headless
 * stability on WSL2/CI runners.
 *
 * `PLAYGROUND_PORT` overrides the port for a local run that must not collide
 * with an already-running dev server (three sibling tasks share this
 * checkout). Unset — which is always the case in CI — the port, the URL and
 * the `pnpm dev` command are byte-identical to before the override existed.
 */

import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PLAYGROUND_PORT ?? "3100";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: BASE_URL,
		trace: "on-first-retry",
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
			command: process.env.PLAYGROUND_PORT
				? `pnpm exec next dev --webpack -p ${PORT}`
				: "pnpm dev",
			url: BASE_URL,
			reuseExistingServer: !process.env.CI,
			timeout: 180_000,
		},
	],
});
