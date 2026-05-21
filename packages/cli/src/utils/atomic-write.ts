import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { CliError } from "./errors.js";

export interface AtomicWriteOptions {
	readonly outDir: string;
	readonly force: boolean;
	readonly write: (tmpDir: string) => Promise<void>;
}

export async function atomicWriteDir(
	options: AtomicWriteOptions,
): Promise<void> {
	const tmpDir = join(
		dirname(options.outDir),
		`${basename(options.outDir)}.tmp`,
	);

	rmSync(tmpDir, { recursive: true, force: true });

	let shouldCleanup = false;
	try {
		mkdirSync(tmpDir, { recursive: true });
		shouldCleanup = true;

		await options.write(tmpDir);

		if (existsSync(options.outDir)) {
			if (!options.force) {
				throw new CliError({
					code: "OUT_EXISTS",
					exitCode: 2,
					message: `Output path "${options.outDir}" already exists. Pass --force to overwrite.`,
				});
			}

			rmSync(options.outDir, { recursive: true, force: true });
		}

		renameSync(tmpDir, options.outDir);
		shouldCleanup = false;
	} catch (error) {
		if (shouldCleanup) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
		throw error;
	}
}
