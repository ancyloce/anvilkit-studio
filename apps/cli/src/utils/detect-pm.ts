import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const PACKAGE_MANAGERS = ["pnpm", "npm", "yarn", "bun"] as const;

export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

const LOCKFILE_TO_PM: ReadonlyArray<readonly [string, PackageManager]> = [
	["pnpm-lock.yaml", "pnpm"],
	["yarn.lock", "yarn"],
	["bun.lock", "bun"],
	["package-lock.json", "npm"],
];

export function detectPm(cwd: string): PackageManager {
	const pmFromUserAgent = parsePmFromUserAgent(process.env.npm_config_user_agent);
	if (pmFromUserAgent !== undefined) {
		return pmFromUserAgent;
	}

	for (const candidateDir of walkUp(resolve(cwd))) {
		for (const [lockfile, packageManager] of LOCKFILE_TO_PM) {
			if (existsSync(resolve(candidateDir, lockfile))) {
				return packageManager;
			}
		}
	}

	return "npm";
}

export function isPackageManager(value: string): value is PackageManager {
	return (PACKAGE_MANAGERS as readonly string[]).includes(value);
}

function parsePmFromUserAgent(
	userAgent: string | undefined,
): PackageManager | undefined {
	if (userAgent === undefined) {
		return undefined;
	}

	const candidate = userAgent.split("/", 1)[0];
	return candidate !== undefined && isPackageManager(candidate)
		? candidate
		: undefined;
}

function* walkUp(startDir: string): Generator<string> {
	let currentDir = startDir;

	while (true) {
		yield currentDir;
		const parentDir = dirname(currentDir);
		if (parentDir === currentDir) {
			return;
		}
		currentDir = parentDir;
	}
}
