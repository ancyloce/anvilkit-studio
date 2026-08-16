import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.COMPONENT_EDITOR_PORT ?? "3200";
const BASE_URL = `http://localhost:${PORT}`;

/**
 * E2E for the component editor (port 3200 — studio owns :3000, playground
 * :3100). `reuseExistingServer` is true locally because the repo's runbook
 * starts the dev server explicitly before Playwright: an orphaned
 * Playwright-owned server holding the port is the single largest source of
 * wasted cycles on this box.
 *
 * `--disable-gpu` mirrors the studio config: headless Chromium's
 * GPU/SwiftShader path is unreliable on this WSL2 host.
 */
export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: BASE_URL,
		trace: "on-first-retry",
		launchOptions: {
			args: ["--disable-gpu", "--disable-software-rasterizer"],
		},
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: `PAGE_STORAGE=memory pnpm dev`,
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
	},
});
