import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { CAC } from "cac";
import pc from "picocolors";

import {
	addToTranspilePackages,
	registerInPuckConfig,
} from "../utils/codemod.js";
import { detectPm, isPackageManager } from "../utils/detect-pm.js";
import { EditPlan, resolveProjectFile } from "../utils/dry-run.js";
import { CliError } from "../utils/errors.js";
import * as logger from "../utils/logger.js";
import { resolveSlug } from "../utils/registry-client.js";
import {
	type RegistryEntry,
	type RegistryEntryKind,
} from "../utils/registry-schema.js";

export interface AddCommandOptions {
	readonly write?: boolean;
	readonly unsafe?: boolean;
	readonly cwd?: string;
	readonly puckConfig?: string;
	readonly nextConfig?: string;
	readonly noInstall?: boolean;
	readonly pm?: string;
	readonly feed?: string;
	readonly kind?: string;
}

const PUCK_CONFIG_CANDIDATES: ReadonlyArray<string> = [
	"lib/puck-config.ts",
	"lib/puck-config.tsx",
	"src/lib/puck-config.ts",
	"app/puck-config.ts",
	"puck-config.ts",
	"puck-config.tsx",
	"puck-config.js",
];

const NEXT_CONFIG_CANDIDATES: ReadonlyArray<string> = [
	"next.config.ts",
	"next.config.mjs",
	"next.config.js",
];

export function register(cli: CAC): void {
	cli
		.command(
			"add <slug>",
			"Add a plugin, template, or component from the marketplace",
		)
		.option("--write", "Apply the codemod (default is dry-run)")
		.option(
			"--unsafe",
			"Allow unverified entries and bypass the registry allow-list",
		)
		.option("--no-install", "Skip running the package manager install step")
		.option("--pm <pm>", "Package manager to use (pnpm, npm, yarn, bun)")
		.option("--cwd <path>", "Working directory of the host project")
		.option("--puck-config <path>", "Path to the host's Puck config file")
		.option("--next-config <path>", "Path to the host's Next.js config file")
		.option("--feed <source>", "Override the registry feed URL or local path")
		.option("--kind <kind>", "Disambiguate when a slug matches multiple kinds")
		.action(async (slug: string, options: AddCommandOptions) => {
			await runAdd(slug, options);
		});
}

export async function runAdd(
	slug: string,
	options: AddCommandOptions = {},
): Promise<void> {
	const cwd = resolve(options.cwd ?? process.cwd());
	const isUnsafe = options.unsafe === true;
	const willWrite = options.write === true;

	const resolution = await resolveSlug(slug, {
		cwd,
		feedSource: options.feed,
		allowUnverified: isUnsafe,
	});

	if (!resolution.ok) {
		throw new CliError({
			code: resolution.code,
			exitCode: 2,
			message: resolution.message,
		});
	}

	const entry = resolution.entry;
	if (options.kind !== undefined && entry.kind !== options.kind) {
		throw new CliError({
			code: "KIND_MISMATCH",
			exitCode: 2,
			message: `Resolved entry "${entry.slug}" is a ${entry.kind}, but --kind ${options.kind} was requested.`,
		});
	}

	logger.info(
		`Resolved ${pc.bold(slug)} → ${pc.bold(entry.packageName)}@${entry.version} (${entry.kind})`,
	);
	logger.info(`Source: ${resolution.origin}`);
	if (!entry.verified) {
		logger.warn(
			`${entry.packageName} is not verified. Continuing because --unsafe is set.`,
		);
	}

	const plan = buildEditPlan(cwd, entry, options);

	if (plan.isEmpty) {
		logger.success(
			`No edits required — ${entry.packageName} is already wired up.`,
		);
		return;
	}

	if (!willWrite) {
		logger.info(
			`Dry run (${plan.count} file(s) would change). Re-run with --write to apply.`,
		);
		process.stdout.write(`${plan.formatDiff()}\n`);
		printFollowups(entry, options, false);
		return;
	}

	const written = plan.commit();
	for (const path of written) {
		logger.success(`updated ${path}`);
	}

	if (options.noInstall === true) {
		logger.info("Skipping package install (--no-install).");
	} else {
		runInstall(cwd, entry, options);
	}

	printFollowups(entry, options, true);
}

function buildEditPlan(
	cwd: string,
	entry: RegistryEntry,
	options: AddCommandOptions,
): EditPlan {
	const plan = new EditPlan(cwd);

	const puckConfigAbs = resolvePuckConfig(cwd, options);
	const puckSource = readFileSync(puckConfigAbs, "utf8");
	const puckOutcome = registerInPuckConfig({
		source: puckSource,
		slug: entry.slug,
		packageName: entry.packageName,
		kind: entry.kind,
	});
	if (puckOutcome.changed) {
		plan.stage(puckConfigAbs, puckOutcome.source);
	}

	if (entry.kind !== "plugin") {
		const nextConfigAbs = resolveNextConfig(cwd, options);
		const nextSource = readFileSync(nextConfigAbs, "utf8");
		const nextOutcome = addToTranspilePackages(nextSource, entry.packageName);
		if (nextOutcome.changed) {
			plan.stage(nextConfigAbs, nextOutcome.source);
		}
	}

	return plan;
}

function resolvePuckConfig(cwd: string, options: AddCommandOptions): string {
	if (options.puckConfig !== undefined) {
		const absolute = resolve(cwd, options.puckConfig);
		if (!existsSync(absolute)) {
			throw new CliError({
				code: "PUCK_CONFIG_MISSING",
				exitCode: 2,
				message: `Puck config not found at ${options.puckConfig}.`,
			});
		}
		return absolute;
	}
	const found = resolveProjectFile(cwd, PUCK_CONFIG_CANDIDATES);
	if (found === undefined) {
		throw new CliError({
			code: "PUCK_CONFIG_MISSING",
			exitCode: 2,
			message: `Could not find a Puck config in ${cwd}. Pass --puck-config <path> to point at it.`,
		});
	}
	return found;
}

function resolveNextConfig(cwd: string, options: AddCommandOptions): string {
	if (options.nextConfig !== undefined) {
		const absolute = resolve(cwd, options.nextConfig);
		if (!existsSync(absolute)) {
			throw new CliError({
				code: "NEXT_CONFIG_MISSING",
				exitCode: 2,
				message: `Next.js config not found at ${options.nextConfig}.`,
			});
		}
		return absolute;
	}
	const found = resolveProjectFile(cwd, NEXT_CONFIG_CANDIDATES);
	if (found === undefined) {
		throw new CliError({
			code: "NEXT_CONFIG_MISSING",
			exitCode: 2,
			message: `Could not find next.config.{ts,mjs,js} in ${cwd}. Pass --next-config <path>.`,
		});
	}
	return found;
}

function runInstall(
	cwd: string,
	entry: RegistryEntry,
	options: AddCommandOptions,
): void {
	if (process.env.ANVILKIT_SKIP_INSTALL === "1") {
		logger.info("Skipping dependency install because ANVILKIT_SKIP_INSTALL=1.");
		return;
	}
	const explicitPm = options.pm;
	const pm =
		explicitPm !== undefined && isPackageManager(explicitPm)
			? explicitPm
			: detectPm(cwd);

	const targets = [`${entry.packageName}@${entry.version}`];
	for (const peer of entry.installSpec.peerInstalls) {
		targets.push(peer);
	}

	logger.info(`Installing with ${pm}: ${targets.join(", ")}`);
	const verb = pm === "npm" || pm === "yarn" ? "install" : "add";
	const result = spawnSync(pm, [verb, ...targets], {
		cwd,
		env: process.env,
		stdio: ["ignore", "ignore", "inherit"],
	});
	if (result.error !== undefined) {
		throw new CliError({
			code: "INSTALL_FAILED",
			exitCode: 1,
			message: `Failed to start ${pm} ${verb}: ${result.error.message}`,
		});
	}
	if (result.status !== 0) {
		throw new CliError({
			code: "INSTALL_FAILED",
			exitCode: 1,
			message: `${pm} ${verb} exited with code ${String(result.status)}`,
		});
	}
}

function printFollowups(
	entry: RegistryEntry,
	options: AddCommandOptions,
	wrote: boolean,
): void {
	const messages: string[] = [];
	if (entry.kind === "template") {
		messages.push(
			`Append the template's IR to your seed: \`import { pageIR } from "${entry.packageName}";\`.`,
		);
	}
	if (entry.kind === "plugin") {
		messages.push(
			`Plugins are registered against the Studio shell. Confirm the import points at the named factory exported by ${entry.packageName}.`,
		);
	}
	if (!wrote) {
		messages.push(
			"Re-run with --write to apply the codemod once the diff above looks correct.",
		);
	} else if (options.noInstall === true) {
		const pm = options.pm ?? "pnpm";
		messages.push(
			`Run \`${pm} install\` (or your equivalent) to fetch ${entry.packageName}.`,
		);
	}
	for (const message of messages) {
		logger.info(message);
	}
}

export type RegistryEntryKindForCli = RegistryEntryKind;

export function relativeToCwd(cwd: string, abs: string): string {
	return relative(cwd, abs);
}
