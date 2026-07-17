import { defineConfig, devices } from "@playwright/test";

// E2E for apps/docs. Boots the Vite dev server (which also starts the
// embedded collab relay on :41234 for the playground's ?collab=1 mode).
export default defineConfig({
	testDir: "./tests",
	// Playwright's default testMatch also collects `*.test.ts`, which under
	// ./tests are VITEST suites (e.g. registry/scorecard-runner.test.ts) that
	// crash at collection. E2E specs are `*.spec.ts` only.
	testMatch: "**/*.spec.ts",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 1,
	workers: 1,
	reporter: process.env.CI ? "github" : "list",
	timeout: 90_000,
	use: {
		baseURL: "http://localhost:4321",
		trace: "on-first-retry",
		// Force CPU rasterization — the same headless-GPU hang apps/studio's
		// Canvas Studio route needed this fix for (Konva's 2D-canvas render
		// hard-locks the main thread under headless Chromium's GPU/SwiftShader
		// path on this WSL2 box; CPU-only 2D canvas is plenty here). The docs
		// playground's canvas overlay is the same Konva stage, so it needs the
		// same flags before any spec drives it.
		launchOptions: {
			args: ["--disable-gpu", "--disable-software-rasterizer"],
		},
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "pnpm dev",
		url: "http://localhost:4321",
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
	},
});
