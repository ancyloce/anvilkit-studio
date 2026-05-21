import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CAC } from "cac";

import { copyScaffold } from "../utils/copy-scaffold.js";
import {
	detectPm,
	isPackageManager,
	PACKAGE_MANAGERS,
	type PackageManager,
} from "../utils/detect-pm.js";
import { CliError } from "../utils/errors.js";
import * as logger from "../utils/logger.js";
import { isInteractive, promptSelect, promptText } from "../utils/prompt.js";

export interface InitCommandOptions {
	readonly force?: boolean;
	readonly help?: boolean;
	readonly input?: boolean;
	readonly pm?: string;
	readonly template?: string;
}

interface MutablePackageJson {
	readonly name?: string;
	dependencies?: Record<string, string>;
}

const DEFAULT_DIR = "anvilkit-site";
const DEFAULT_TEMPLATE_VERSION = "0.1.0-alpha.0";
const TEMPLATE_ASSIGNMENT_MARKER = "const seedPageIR: PageIR = defaultPageIR;";

export function register(cli: CAC): void {
	cli
		.command("init [dir]", "Scaffold a new Anvilkit project")
		.option("--template <slug>", "Template slug")
		.option("--pm <pm>", "Package manager")
		.option("--force", "Overwrite existing files")
		.option("--no-input", "Disable prompts")
		.action(async (dir?: string, options?: InitCommandOptions) => {
			await runInit(dir, options);
		});
}

export async function runInit(
	dir?: string,
	options: InitCommandOptions = {},
): Promise<void> {
	const targetDir = await resolveTargetDir(dir);
	const projectName = basename(targetDir);
	const packageManager = await resolvePackageManager(targetDir, options.pm);

	ensureTargetDirReady(targetDir, Boolean(options.force));
	mkdirSync(targetDir, { recursive: true });

	logger.info(`Scaffolding ${projectName} in ${targetDir}`);
	copyScaffold({
		sourceDir: resolveScaffoldRoot(),
		targetDir,
		name: projectName,
	});

	if (options.template !== undefined) {
		hydrateTemplate(targetDir, options.template);
	}

	installDependencies(targetDir, packageManager);
	logNextSteps(targetDir, packageManager);
}

async function resolveTargetDir(dir?: string): Promise<string> {
	if (dir !== undefined) {
		return resolve(dir);
	}

	if (!isInteractive()) {
		throw new CliError({
			code: "MISSING_DIR",
			exitCode: 2,
			message: "Missing target directory; pass <dir> for non-TTY use.",
		});
	}

	const promptedDir = await promptText({
		message: "target directory",
		defaultValue: DEFAULT_DIR,
	});
	return resolve(promptedDir);
}

async function resolvePackageManager(
	cwd: string,
	explicitPm?: string,
): Promise<PackageManager> {
	if (explicitPm !== undefined) {
		if (!isPackageManager(explicitPm)) {
			throw new CliError({
				code: "INVALID_PM",
				exitCode: 2,
				message: `Unsupported package manager "${explicitPm}". Expected pnpm, npm, yarn, or bun.`,
			});
		}
		return explicitPm;
	}

	const detectedPm = resolveDefaultPm(cwd);
	if (!isInteractive()) {
		return detectedPm;
	}

	return promptSelect<PackageManager>({
		message: "package manager",
		defaultValue: detectedPm,
		options: PACKAGE_MANAGERS.map((pm) => ({
			value: pm,
			label: pm,
			hint: pm === detectedPm ? "detected" : undefined,
		})),
	});
}

function resolveDefaultPm(cwd: string): PackageManager {
	const envPm = process.env.PUCK_DEMO_PM;
	if (envPm !== undefined && isPackageManager(envPm)) {
		return envPm;
	}
	return detectPm(cwd);
}

function ensureTargetDirReady(targetDir: string, force: boolean): void {
	if (!existsSync(targetDir)) {
		return;
	}

	const targetStat = statSync(targetDir);
	if (!targetStat.isDirectory()) {
		throw new CliError({
			code: "DIR_NOT_EMPTY",
			exitCode: 2,
			message: `Target path "${targetDir}" already exists and is not a directory.`,
		});
	}

	const visibleEntries = readdirSync(targetDir).filter(
		(entry) => entry !== ".git",
	);
	if (visibleEntries.length > 0 && !force) {
		throw new CliError({
			code: "DIR_NOT_EMPTY",
			exitCode: 2,
			message: `Target directory "${targetDir}" is not empty. Pass --force to continue.`,
		});
	}
}

function resolveScaffoldRoot(): string {
	const candidates = [
		fileURLToPath(new URL("../scaffolds/nextjs", import.meta.url)),
		fileURLToPath(new URL("../../src/scaffolds/nextjs", import.meta.url)),
	];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	throw new CliError({
		code: "SCAFFOLD_NOT_FOUND",
		exitCode: 1,
		message: "Unable to locate the bundled Next.js scaffold.",
	});
}

function hydrateTemplate(targetDir: string, templateSlug: string): void {
	const packageJsonPath = resolve(targetDir, "package.json");
	const packageJson = JSON.parse(
		readFileSync(packageJsonPath, "utf8"),
	) as MutablePackageJson;
	const templatePackage = `@anvilkit/template-${templateSlug}`;
	const dependencyVersion =
		packageJson.dependencies?.["@anvilkit/core"] ?? DEFAULT_TEMPLATE_VERSION;

	packageJson.dependencies = sortDependencies({
		...(packageJson.dependencies ?? {}),
		[templatePackage]: dependencyVersion,
	});
	writeFileSync(
		packageJsonPath,
		`${JSON.stringify(packageJson, null, "\t")}\n`,
		"utf8",
	);

	const editorPagePath = resolve(
		targetDir,
		"app",
		"puck",
		"[...puck]",
		"page.tsx",
	);
	const editorPage = readFileSync(editorPagePath, "utf8");
	const importLine = `import { pageIR as initialData } from "${templatePackage}";`;

	const withImport = insertImportAfterUseClient(editorPage, importLine);
	if (!withImport.includes(TEMPLATE_ASSIGNMENT_MARKER)) {
		throw new CliError({
			code: "SCAFFOLD_INVALID",
			exitCode: 1,
			message:
				"The embedded scaffold route is missing the template hydration marker.",
		});
	}

	writeFileSync(
		editorPagePath,
		withImport.replace(
			TEMPLATE_ASSIGNMENT_MARKER,
			"const seedPageIR: PageIR = initialData;",
		),
		"utf8",
	);
}

function insertImportAfterUseClient(
	source: string,
	importLine: string,
): string {
	if (source.includes(importLine)) {
		return source;
	}

	if (source.startsWith('"use client";')) {
		return source.replace('"use client";', `"use client";\n\n${importLine}`);
	}

	return `${importLine}\n${source}`;
}

function sortDependencies(
	dependencies: Record<string, string>,
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(dependencies).sort(([left], [right]) =>
			left.localeCompare(right),
		),
	);
}

function installDependencies(
	targetDir: string,
	packageManager: PackageManager,
): void {
	if (process.env.ANVILKIT_SKIP_INSTALL === "1") {
		logger.info("Skipping dependency install because ANVILKIT_SKIP_INSTALL=1");
		return;
	}

	logger.info(`Installing dependencies with ${packageManager}`);
	const result = spawnSync(packageManager, ["install"], {
		cwd: targetDir,
		env: process.env,
		stdio: ["ignore", "ignore", "inherit"],
	});

	if (result.error !== undefined) {
		throw new CliError({
			code: "INSTALL_FAILED",
			exitCode: 1,
			message: `Failed to start ${packageManager} install: ${result.error.message}`,
		});
	}

	if (result.status !== 0) {
		throw new CliError({
			code: "INSTALL_FAILED",
			exitCode: 1,
			message: `${packageManager} install exited with code ${String(result.status)}`,
		});
	}
}

function logNextSteps(targetDir: string, packageManager: PackageManager): void {
	logger.success(`Created ${basename(targetDir)} in ${targetDir}`);
	logger.success(`Next steps: cd ${targetDir}`);

	if (process.env.ANVILKIT_SKIP_INSTALL === "1") {
		logger.success(`Then run: ${packageManager} install`);
	}

	logger.success(`Then run: ${packageManager} dev`);
}
