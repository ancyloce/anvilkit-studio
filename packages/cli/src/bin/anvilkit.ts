import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type CAC, cac } from "cac";

import { register as registerAdd } from "../commands/add.js";
import { register as registerExport } from "../commands/export.js";
import { register as registerGenerate } from "../commands/generate.js";
import { register as registerInit } from "../commands/init.js";
import { register as registerValidate } from "../commands/validate.js";
import { CliError } from "../utils/errors.js";
import * as logger from "../utils/logger.js";

function readPackageVersion(): string {
	const packageJson = JSON.parse(
		readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
	) as { version: string };
	return packageJson.version;
}

export function createCli(): CAC {
	const cli = cac("anvilkit");

	cli.version(readPackageVersion(), "-V, --version");

	registerInit(cli);
	registerAdd(cli);
	registerValidate(cli);
	registerExport(cli);
	registerGenerate(cli);

	cli.help();

	return cli;
}

function formatError(error: unknown): { exitCode: number; message: string } {
	if (error instanceof CliError) {
		return {
			exitCode: error.exitCode,
			message: `[${error.code}] ${error.message}`,
		};
	}

	if (error instanceof Error) {
		return {
			exitCode: 1,
			message: error.message,
		};
	}

	return {
		exitCode: 1,
		message: String(error),
	};
}

export async function main(
	argv: readonly string[] = process.argv,
): Promise<number> {
	const cli = createCli();
	const previousExitCode = process.exitCode;

	try {
		process.exitCode = undefined;
		cli.parse([...argv], { run: false });
		await cli.runMatchedCommand();
		return process.exitCode ?? 0;
	} catch (error) {
		const formatted = formatError(error);
		logger.error(formatted.message);
		return formatted.exitCode;
	} finally {
		process.exitCode = previousExitCode;
	}
}

const isMain =
	process.argv[1] !== undefined &&
	resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
	main(process.argv)
		.then((exitCode) => {
			process.exit(exitCode);
		})
		.catch((error) => {
			const formatted = formatError(error);
			logger.error(formatted.message);
			process.exit(formatted.exitCode);
		});
}
