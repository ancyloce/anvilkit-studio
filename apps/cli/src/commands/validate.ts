import { validateComponentConfig, type ValidationResult } from "@anvilkit/validator";
import type { CAC } from "cac";

import { formatJson, formatPretty } from "../utils/format-validation.js";
import { CliError } from "../utils/errors.js";
import { success } from "../utils/logger.js";
import { resolvePuckConfig } from "../utils/resolve-puck-config.js";

export interface ValidateCommandOptions {
	readonly format?: "pretty" | "json";
	readonly help?: boolean;
	readonly input?: boolean;
}

export function register(cli: CAC): void {
	cli.command("validate <file>", "Validate a source file against Anvilkit rules")
		.option("--format <format>", "Output format")
		.option("--no-input", "Disable prompts")
		.action(async (file?: string, options?: ValidateCommandOptions) => {
			if (file === undefined) {
				throw new CliError({
					code: "MISSING_FLAG",
					exitCode: 2,
					message: "Missing required <file> argument.",
				});
			}

			process.exitCode = await runValidate(file, options);
		});
}

export async function runValidate(
	file: string,
	options: ValidateCommandOptions = {},
): Promise<number> {
	const { config } = await resolvePuckConfig(file);
	const result = validateComponentConfig(
		config as Parameters<typeof validateComponentConfig>[0],
	);

	if (options.format === "json") {
		process.stdout.write(`${formatJson(result)}\n`);
		return result.valid ? 0 : 1;
	}

	writePrettyResult(result);
	return result.valid ? 0 : 1;
}

function writePrettyResult(result: ValidationResult): void {
	const output = formatPretty(result);

	if (!result.valid) {
		process.stderr.write(`${output}\n`);
		return;
	}

	const lines = output.split("\n");
	const summary = lines.pop() ?? "";

	if (lines.length > 0) {
		process.stderr.write(`${lines.join("\n")}\n`);
	}

	success(summary);
}
