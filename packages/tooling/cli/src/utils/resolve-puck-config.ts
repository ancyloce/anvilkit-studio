import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createJiti } from "jiti";

import { CliError } from "./errors.js";

const jiti = createJiti(import.meta.url, {
	interopDefault: true,
});

export interface ResolvedPuckConfig {
	readonly path: string;
	readonly config: unknown;
}

export async function resolvePuckConfig(
	filePath: string,
): Promise<ResolvedPuckConfig> {
	const absolutePath = resolve(filePath);

	if (!existsSync(absolutePath)) {
		throw new CliError({
			code: "FILE_NOT_FOUND",
			exitCode: 2,
			message: `Puck config file not found at ${absolutePath}.`,
		});
	}

	try {
		const loadedModule = await jiti.import(absolutePath);
		const config = resolveModuleConfig(loadedModule);

		if (!isObjectLike(config)) {
			throw createInvalidConfigError(absolutePath);
		}

		return {
			path: absolutePath,
			config,
		};
	} catch (error) {
		if (error instanceof CliError) {
			throw error;
		}

		const detail = error instanceof Error ? error.message : String(error);
		throw new CliError({
			code: "CONFIG_LOAD_FAILED",
			exitCode: 2,
			message: `Failed to load Puck config at ${absolutePath}: ${detail}`,
		});
	}
}

function resolveModuleConfig(loadedModule: unknown): unknown {
	if (!isObjectLike(loadedModule)) {
		return undefined;
	}

	const defaultExport =
		"default" in loadedModule ? loadedModule.default : undefined;
	if (isObjectLike(defaultExport)) {
		return defaultExport;
	}

	const namedConfig =
		"config" in loadedModule ? loadedModule.config : undefined;
	if (isObjectLike(namedConfig)) {
		return namedConfig;
	}

	if ("default" in loadedModule || "config" in loadedModule) {
		return undefined;
	}

	return loadedModule;
}

function createInvalidConfigError(path: string): CliError {
	return new CliError({
		code: "INVALID_CONFIG",
		exitCode: 2,
		message: `Expected ${path} to export a default config object or named "config" object.`,
	});
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
