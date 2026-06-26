import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest config for `apps/docs`.
 *
 * Scopes test discovery to `tests/**\/*.test.ts` so it covers the
 * documentation code-block tests under `tests/guides/**` plus the
 * registry-feed unit tests under `tests/registry/**`. The Playwright
 * spec at `tests/playground.spec.ts` (and any future `*.spec.ts`)
 * stays excluded — those run under a separate `pnpm e2e` script.
 *
 * The `@/` and `@scripts/` aliases mirror `tsconfig.json` so the excluded
 * `tests/**` (which tsc never sees) can import app/source modules by alias
 * instead of `../../` paths. This config has no Vite plugins, so the aliases
 * are declared explicitly rather than via tsconfig path inference.
 */
export default defineConfig({
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
			"@scripts": fileURLToPath(new URL("./scripts", import.meta.url)),
		},
	},
	test: {
		name: "@anvilkit/docs-site",
		environment: "node",
		globals: false,
		include: ["tests/**/*.test.ts"],
		clearMocks: true,
		restoreMocks: true,
	},
});
