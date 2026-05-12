import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createJiti } from "jiti";

import { CliError } from "./errors.js";

export type {
	AnvilkitUserConfig,
	GeneratePageFn,
} from "./define-anvilkit-config.js";
export { defineConfig } from "./define-anvilkit-config.js";

const CONFIG_CANDIDATES = [
	"anvilkit.config.ts",
	"anvilkit.config.mts",
	"anvilkit.config.cts",
	"anvilkit.config.js",
	"anvilkit.config.mjs",
	"anvilkit.config.cjs",
] as const;

export interface LoadedAnvilkitConfig<TConfig = unknown> {
	readonly config: TConfig;
	readonly path: string;
}

export async function loadAnvilkitConfig(
	cwd: string,
): Promise<LoadedAnvilkitConfig | null> {
	const configPath = CONFIG_CANDIDATES.map((candidate) =>
		resolve(cwd, candidate),
	).find((candidate) => existsSync(candidate));

	if (configPath === undefined) {
		return null;
	}

	const jiti = createJiti(import.meta.url, {
		interopDefault: true,
	});

	try {
		const config = await jiti.import(configPath, { default: true });
		return { path: configPath, config };
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new CliError({
			code: "CONFIG_LOAD_FAILED",
			message: `Failed to load Anvilkit config at ${configPath}: ${detail}`,
		});
	}
}
