import { nodePreset } from "@anvilkit/vitest-config/node";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
	nodePreset,
	defineConfig({
		test: {
			name: "anvilkit",
			environment: "node",
			// The command specs (`bin`, `init`, `export`, `validate`) exercise
			// the real CLI through `spawnSync("node", ["--import", "tsx", ...])`,
			// so each case pays a cold `tsx`/esbuild transpile of the entry tree
			// in a child process. In isolation that's well under 1s, but under
			// `pnpm test`'s Turbo fan-out — every workspace package's Vitest
			// (and its own worker pool) running at once — the spawned child is
			// CPU-starved and blows the default 5s `testTimeout`. Raise the
			// ceiling so contention does not flake CI; a genuine hang (e.g. a
			// prompt awaiting stdin despite `--no-input`) still fails, just later.
			testTimeout: 30000,
			hookTimeout: 30000,
		},
	}),
);
