/**
 * Playwright configuration for `apps/playground`.
 *
 * Compatibility smoke harness: boots the playground's Next.js dev server
 * (port 3100 — studio owns :3000) and runs the specs under `./e2e`.
 * Conventions mirror `apps/studio/playwright.config.ts`: Chromium only,
 * `pnpm dev` for fast feedback, CPU rasterization flags for headless
 * stability on WSL2/CI runners.
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
		baseURL: "http://localhost:3100",
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
			command: "pnpm dev",
			url: "http://localhost:3100",
			reuseExistingServer: !process.env.CI,
			timeout: 180_000,
		},
	],
});
