import { nodePreset } from "@anvilkit/vitest-config/node";
import { defineConfig, mergeConfig } from "vitest/config";

/**
 * `@anvilkit/contracts` uses the `node` preset: the package ships
 * zero React imports and zero runtime code. The test suite is
 * type-level assertions plus dependency-direction guards (the
 * package.json must stay runtime-dependency-free).
 */
export default mergeConfig(
	nodePreset,
	defineConfig({
		test: {
			name: "@anvilkit/contracts",
			passWithNoTests: true,
		},
	}),
);
