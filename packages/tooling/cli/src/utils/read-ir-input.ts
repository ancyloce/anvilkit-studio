import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { PageIR, PageIRAsset, PageIRNode } from "@anvilkit/core/types";
import { puckDataToIR } from "@anvilkit/ir";
import { createJiti } from "jiti";

import { CliError } from "./errors.js";
import { resolvePuckConfig } from "./resolve-puck-config.js";

const MODULE_EXTENSIONS = new Set([".ts", ".mts", ".cts", ".js", ".mjs"]);

const jiti = createJiti(import.meta.url, {
	interopDefault: true,
});

export interface ReadIrInputOptions {
	readonly configPath?: string;
	readonly from?: "puck";
	readonly input: string;
}

export interface ReadIrInputResult {
	readonly ir: PageIR;
	readonly source: "ir-json" | "ir-module" | "puck-snapshot";
}

export async function readIrInput(
	options: ReadIrInputOptions,
): Promise<ReadIrInputResult> {
	const inputPath = resolve(options.input);
	ensureFileExists(inputPath);

	if (options.from === "puck") {
		return readPuckSnapshot(inputPath, options.configPath);
	}

	const extension = extname(inputPath).toLowerCase();
	if (extension === ".json") {
		return {
			ir: parsePageIR(readJsonFile(inputPath), inputPath),
			source: "ir-json",
		};
	}

	if (MODULE_EXTENSIONS.has(extension)) {
		return {
			ir: parsePageIR(await loadPageIrModule(inputPath), inputPath),
			source: "ir-module",
		};
	}

	throw invalidInput(
		inputPath,
		"Expected a .json, .ts, .mts, .cts, .js, or .mjs input file.",
	);
}

async function readPuckSnapshot(
	inputPath: string,
	configPath?: string,
): Promise<ReadIrInputResult> {
	if (configPath === undefined || configPath === "") {
		throw new CliError({
			code: "MISSING_CONFIG",
			exitCode: 2,
			message: "--config <path> is required when --from puck is set.",
		});
	}

	const extension = extname(inputPath).toLowerCase();
	const data =
		extension === ".json"
			? readJsonFile(inputPath)
			: MODULE_EXTENSIONS.has(extension)
				? await loadPuckDataModule(inputPath)
				: undefined;

	if (!isPuckData(data)) {
		throw invalidInput(
			inputPath,
			"Expected a Puck Data snapshot object with root/content/zones keys.",
		);
	}

	const { config } = await resolvePuckConfig(configPath);
	const ir = puckDataToIR(
		data as Parameters<typeof puckDataToIR>[0],
		config as Parameters<typeof puckDataToIR>[1],
	);

	return {
		ir,
		source: "puck-snapshot",
	};
}

function ensureFileExists(filePath: string): void {
	if (!existsSync(filePath)) {
		throw new CliError({
			code: "FILE_NOT_FOUND",
			exitCode: 2,
			message: `Input file not found at ${filePath}.`,
		});
	}
}

function readJsonFile(filePath: string): unknown {
	try {
		return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw invalidInput(filePath, `Failed to parse JSON: ${detail}`);
	}
}

async function loadPageIrModule(filePath: string): Promise<unknown> {
	const loadedModule = await loadModule(filePath);

	if (isObjectLike(loadedModule) && "pageIR" in loadedModule) {
		return loadedModule.pageIR;
	}

	if (isObjectLike(loadedModule) && "default" in loadedModule) {
		return loadedModule.default;
	}

	return loadedModule;
}

async function loadPuckDataModule(filePath: string): Promise<unknown> {
	const loadedModule = await loadModule(filePath);

	if (isObjectLike(loadedModule) && "data" in loadedModule) {
		return loadedModule.data;
	}

	if (isObjectLike(loadedModule) && "default" in loadedModule) {
		return loadedModule.default;
	}

	return loadedModule;
}

async function loadModule(filePath: string): Promise<unknown> {
	try {
		return await jiti.import(filePath);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw invalidInput(filePath, `Failed to load module: ${detail}`);
	}
}

function parsePageIR(value: unknown, filePath: string): PageIR {
	if (!isPageIR(value)) {
		throw invalidInput(
			filePath,
			'Expected a PageIR object with version "1", root, assets, and metadata.',
		);
	}

	return value;
}

function invalidInput(filePath: string, reason: string): CliError {
	return new CliError({
		code: "INVALID_INPUT",
		exitCode: 1,
		message: `Invalid input at ${filePath}: ${reason}`,
	});
}

function isPageIR(value: unknown): value is PageIR {
	if (!isObjectLike(value)) {
		return false;
	}

	return (
		value.version === "1" &&
		isPageIRNode(value.root) &&
		Array.isArray(value.assets) &&
		value.assets.every((asset) => isPageIRAsset(asset)) &&
		isObjectLike(value.metadata)
	);
}

function isPageIRNode(value: unknown): value is PageIRNode {
	if (!isObjectLike(value)) {
		return false;
	}

	if (
		typeof value.id !== "string" ||
		typeof value.type !== "string" ||
		!isObjectLike(value.props)
	) {
		return false;
	}

	if ("children" in value) {
		if (
			!Array.isArray(value.children) ||
			!value.children.every((child) => isPageIRNode(child))
		) {
			return false;
		}
	}

	if ("assets" in value) {
		if (
			!Array.isArray(value.assets) ||
			!value.assets.every((asset) => isPageIRAsset(asset))
		) {
			return false;
		}
	}

	return true;
}

function isPageIRAsset(value: unknown): value is PageIRAsset {
	if (!isObjectLike(value)) {
		return false;
	}

	return (
		typeof value.id === "string" &&
		typeof value.kind === "string" &&
		typeof value.url === "string" &&
		(!("meta" in value) || value.meta === undefined || isObjectLike(value.meta))
	);
}

function isPuckData(value: unknown): value is {
	readonly content: readonly unknown[];
	readonly root: Record<string, unknown>;
	readonly zones: Record<string, unknown>;
} {
	return (
		isObjectLike(value) &&
		Array.isArray(value.content) &&
		isObjectLike(value.root) &&
		isObjectLike(value.zones)
	);
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
