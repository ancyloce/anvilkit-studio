import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CAC } from "cac";

import { atomicWriteDir } from "../utils/atomic-write.js";
import { CliError } from "../utils/errors.js";
import { dispatchFormat } from "../utils/format-dispatch.js";
import { success } from "../utils/logger.js";
import { readIrInput } from "../utils/read-ir-input.js";

export interface ExportCommandOptions {
	readonly assetStrategy?: "url-prop" | "inline";
	readonly config?: string;
	readonly force?: boolean;
	readonly format?: string;
	readonly from?: string;
	readonly help?: boolean;
	readonly inlineAssets?: boolean;
	readonly input?: boolean;
	readonly out?: string;
	readonly syntax?: "tsx" | "jsx";
}

export function register(cli: CAC): void {
	cli.command("export <input>", "Export input using an Anvilkit formatter")
		.option("--format <format>", "Target export format")
		.option("--out <dir>", "Output directory")
		.option("--from <source>", "Input source adapter")
		.option("--config <path>", "Path to an Anvilkit config file")
		.option("--inline-assets", "Inline generated assets")
		.option("--syntax <syntax>", "JSX syntax for React output")
		.option("--asset-strategy <strategy>", "Asset emission strategy")
		.option("--force", "Overwrite existing files")
		.option("--no-input", "Disable prompts")
		.action(async (input?: string, options?: ExportCommandOptions) => {
			if (input === undefined) {
				throw new CliError({
					code: "MISSING_FLAG",
					exitCode: 2,
					message: "Missing required <input> argument.",
				});
			}

			process.exitCode = await runExport(input, options);
		});
}

export async function runExport(
	input: string,
	options: ExportCommandOptions = {},
): Promise<number> {
	const format = options.format;
	if (format !== "html" && format !== "react") {
		throw new CliError({
			code: "INVALID_FORMAT",
			exitCode: 2,
			message: "--format must be html|react",
		});
	}

	if (options.out === undefined || options.out === "") {
		throw new CliError({
			code: "MISSING_FLAG",
			exitCode: 2,
			message: "Missing required --out <dir> flag.",
		});
	}

	const outDir = resolve(options.out);
	const { ir } = await readIrInput({
		input,
		from: options.from === "puck" ? "puck" : undefined,
		configPath: options.config,
	});
	const result = await dispatchFormat(ir, {
		format,
		inlineAssets: options.inlineAssets,
		syntax: options.syntax,
		assetStrategy: options.assetStrategy,
	});

	await atomicWriteDir({
		outDir,
		force: Boolean(options.force),
		write: async (tmpDir) => {
			const filePath = resolve(tmpDir, result.filename);
			mkdirSync(dirname(filePath), { recursive: true });
			writeFileSync(filePath, result.content, "utf8");
		},
	});

	success(`Exported ${result.filename} to ${outDir}`);
	return 0;
}
