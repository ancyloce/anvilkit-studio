/**
 * Playwright configuration for `apps/docs`.
 *
 * Boots the Starlight site with `astro preview` (after a full
 * `astro build`) so the playground spec exercises the same bundle
 * that ships to production. `phase4-004` mandates the smoke spec
 * runs on CI; see `docs/tasks/phase4-004-interactive-playground.md`.
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	// Vitest owns `tests/guides/**` (phase4-006 plugin-authoring guide
	// harness) and `tests/registry/**` (phase6-011 feed unit tests).
	// Excluding both here keeps Playwright from trying to drive
	// unit-test files as browser specs.
	testIgnore: ["**/guides/**", "**/registry/**"],
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: "http://localhost:4321",
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: "pnpm preview",
		url: "http://localhost:4321",
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
	},
});
