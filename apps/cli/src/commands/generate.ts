import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AiValidationIssue } from "@anvilkit/core/types";
import { configToAiContext } from "@anvilkit/schema";
import { validateAiOutput } from "@anvilkit/validator";
import type { CAC } from "cac";

import type {
	AnvilkitUserConfig,
	GeneratePageFn,
} from "../utils/define-anvilkit-config.js";
import { CliError } from "../utils/errors.js";
import { loadAnvilkitConfig } from "../utils/load-anvilkit-config.js";
import { resolvePuckConfig } from "../utils/resolve-puck-config.js";

export interface GenerateCommandOptions {
	readonly config?: string;
	readonly format?: string;
	readonly help?: boolean;
	readonly input?: boolean;
	readonly mock?: boolean;
	readonly out?: string;
}

export function register(cli: CAC): void {
	cli.command("generate <prompt>", "Generate structured output from an Anvilkit prompt")
		.option("--config <path>", "Path to an Anvilkit config file")
		.option("--out <path>", "Output path or - for stdout")
		.option("--mock", "Use mock generation output")
		.option("--format <format>", "Output format")
		.option("--no-input", "Disable prompts")
		.action(async (prompt?: string, options?: GenerateCommandOptions) => {
			if (prompt === undefined) {
				throw new CliError({
					code: "MISSING_FLAG",
					exitCode: 2,
					message: "Missing required <prompt> argument.",
				});
			}

			process.exitCode = await runGenerate(prompt, options);
		});
}

export async function runGenerate(
	prompt: string,
	options: GenerateCommandOptions = {},
): Promise<number> {
	const format = resolveFormat(options.format);

	if (options.config === undefined || options.config === "") {
		throw new CliError({
			code: "MISSING_FLAG",
			exitCode: 2,
			message: "Missing required --config <path> flag.",
		});
	}

	if (options.out === undefined || options.out === "") {
		throw new CliError({
			code: "MISSING_FLAG",
			exitCode: 2,
			message: "Missing required --out <path> flag.",
		});
	}

	const loadedConfig = await loadAnvilkitConfig(process.cwd());
	if (loadedConfig === null) {
		throw new CliError({
			code: "NO_ANVILKIT_CONFIG",
			exitCode: 2,
			message:
				"no anvilkit.config.ts found; run `anvilkit init` or see docs/cli/generate",
		});
	}

	const generatePage = await resolveGeneratePage(loadedConfig.config, Boolean(options.mock));
	const { config } = await resolvePuckConfig(options.config);
	const generationContext = configToAiContext(
		config as Parameters<typeof configToAiContext>[0],
	);
	const ir = await generatePage(prompt, generationContext);
	const validation = validateAiOutput(ir, generationContext.availableComponents);

	if (!validation.valid) {
		process.stderr.write(`${formatValidationIssues(validation.issues, format)}\n`);
		return 1;
	}

	const serialized = `${JSON.stringify(ir, null, 2)}\n`;
	if (options.out === "-") {
		process.stdout.write(serialized);
		return 0;
	}

	await writeFile(resolve(options.out), serialized, "utf8");
	return 0;
}

async function resolveGeneratePage(
	loadedConfig: unknown,
	useMock: boolean,
): Promise<GeneratePageFn> {
	if (useMock) {
		const { createMockGeneratePage } = await import(
			"@anvilkit/plugin-ai-copilot/mock"
		);
		return createMockGeneratePage();
	}

	const userConfig = isAnvilkitUserConfig(loadedConfig) ? loadedConfig : undefined;
	if (typeof userConfig?.generatePage !== "function") {
		throw new CliError({
			code: "MISSING_GENERATE_PAGE",
			exitCode: 2,
			message: "anvilkit.config.ts has no `generatePage` export",
		});
	}

	return userConfig.generatePage;
}

function resolveFormat(format?: string): "pretty" | "json" {
	if (format === undefined || format === "pretty") {
		return "pretty";
	}

	if (format === "json") {
		return format;
	}

	throw new CliError({
		code: "INVALID_FORMAT",
		exitCode: 2,
		message: "--format must be pretty|json",
	});
}

function formatValidationIssues(
	issues: readonly AiValidationIssue[],
	format: "pretty" | "json",
): string {
	if (format === "json") {
		return JSON.stringify(issues, null, 2);
	}

	const errorCount = issues.filter((issue) => issue.severity === "error").length;
	const warningCount = issues.filter((issue) => issue.severity === "warn").length;
	const lines = issues.map((issue) => {
		const target = issue.path === "" ? "<root>" : issue.path;
		const symbol = issue.severity === "error" ? "×" : "!";
		return `${symbol} ${target} ${issue.message}`;
	});

	return [...lines, `${errorCount} errors, ${warningCount} warnings`].join("\n");
}

function isAnvilkitUserConfig(value: unknown): value is AnvilkitUserConfig {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
