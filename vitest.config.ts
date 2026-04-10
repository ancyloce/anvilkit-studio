import { defineConfig } from "vitest/config";

/**
 * Workspace-level Vitest config for `pnpm test:watch`.
 *
 * CI and `pnpm test` go through `turbo run test`, which invokes each
 * package's own `vitest.config.ts` with Turbo-level caching. This root
 * config exists so developers can run `pnpm test:watch` once at the
 * workspace root and get a single Vitest watcher that tracks every
 * project in `test.projects`.
 *
 * `test.projects` replaces the deprecated `vitest.workspace.ts` file
 * (deprecated since Vitest 3.2). See https://vitest.dev/guide/projects.
 *
 * Add new packages to the list below as they adopt Vitest.
 */
export default defineConfig({
	test: {
		projects: ["packages/ui", "packages/utils", "packages/core"],
	},
});
