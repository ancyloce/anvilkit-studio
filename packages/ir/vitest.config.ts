import { nodePreset } from "@anvilkit/vitest-config/node";
import { defineConfig, mergeConfig } from "vitest/config";

/**
 * `@anvilkit/ir` uses the `node` preset because the package ships
 * zero React imports and never touches the DOM. The transforms
 * operate on plain Puck `Data` → `PageIR` shapes, which are JSON-
 * serializable — jsdom would only add startup cost without buying
 * us anything.
 *
 * No tests ship with the scaffold (phase3-002). Real specs land in
 * `phase3-003` (round-trip) and `phase3-004` (helpers + snapshots).
 */
export default mergeConfig(
	nodePreset,
	defineConfig({
		test: {
			name: "@anvilkit/ir",
			passWithNoTests: true,
		},
	}),
);
