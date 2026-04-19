import { defineConfig } from "vitest/config";

/**
 * Vitest config for `apps/docs`.
 *
 * Scopes test discovery to `tests/guides/**` so the suite only picks
 * up the documentation code-block tests. The Playwright spec at
 * `tests/playground.spec.ts` is intentionally excluded — it runs
 * under a separate `pnpm e2e` script.
 */
export default defineConfig({
	test: {
		name: "@anvilkit/docs-site",
		environment: "node",
		globals: false,
		include: ["tests/guides/**/*.test.ts"],
		clearMocks: true,
		restoreMocks: true,
	},
});
