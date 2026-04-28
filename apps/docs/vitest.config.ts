import { defineConfig } from "vitest/config";

/**
 * Vitest config for `apps/docs`.
 *
 * Scopes test discovery to `tests/**\/*.test.ts` so it covers the
 * documentation code-block tests under `tests/guides/**` plus the
 * registry-feed unit tests under `tests/registry/**`. The Playwright
 * spec at `tests/playground.spec.ts` (and any future `*.spec.ts`)
 * stays excluded — those run under a separate `pnpm e2e` script.
 */
export default defineConfig({
	test: {
		name: "@anvilkit/docs-site",
		environment: "node",
		globals: false,
		include: ["tests/**/*.test.ts"],
		clearMocks: true,
		restoreMocks: true,
	},
});
