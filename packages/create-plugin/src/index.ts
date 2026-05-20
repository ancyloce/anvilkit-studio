#!/usr/bin/env node
/**
 * @anvilkit/create-plugin — scaffold a ready-to-build StudioPlugin
 * package. Two invocation shapes work:
 *
 *   pnpm dlx @anvilkit/create-plugin --name my-plugin \
 *                                    --display "My Plugin" \
 *                                    --category rail-panel
 *
 *   pnpm create @anvilkit/plugin  (interactive)
 *
 * Flags accepted: --name, --display, --category, --dir, --overwrite,
 * --help, --version. Missing flags are prompted for when stdin is a
 * TTY; otherwise the CLI errors so CI invocations fail loud.
 *
 * Reference: phase4-011.
 */
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Shipped alongside `dist/` in the published tarball. */
const TEMPLATE_ROOT = resolve(__dirname, "..", "templates", "plugin");

const VALID_CATEGORIES = ["export", "ai", "rail-panel", "custom"] as const;
// Caret-on-prerelease is semver-quirky in pnpm: `^0.1.0-alpha`
// only accepts other `0.1.0-*` prereleases, not `0.1.1-alpha` etc.
// Use an explicit band so prereleases on later patches resolve cleanly.
const CORE_VERSION_RANGE = ">=0.1.0-alpha <0.2.0";
type Category = (typeof VALID_CATEGORIES)[number];

const TEXT_EXTENSIONS = new Set([
	".cjs",
	".js",
	".json",
	".md",
	".mjs",
	".ts",
	".yaml",
	".yml",
]);

function isTextFile(path: string): boolean {
	const dot = path.lastIndexOf(".");
	return dot >= 0 && TEXT_EXTENSIONS.has(path.slice(dot));
}

interface Options {
	readonly name: string;
	readonly display: string;
	readonly category: Category;
	readonly dir: string;
	readonly overwrite: boolean;
}

function printHelp(): void {
	console.log(`@anvilkit/create-plugin — scaffold an Anvilkit StudioPlugin

Usage:
  pnpm create @anvilkit/plugin [flags]

Flags:
  --name <slug>          Package slug (e.g. my-plugin). Becomes the folder name.
  --display <label>      Human-readable plugin name (e.g. "My Plugin").
  --category <category>  One of: ${VALID_CATEGORIES.join(", ")}
  --dir <path>           Parent directory for the generated folder (default: cwd).
  --overwrite            Overwrite template files in an existing non-empty target
                         folder. Files NOT in the template are kept. No backup,
                         no confirmation prompt.
  --help, -h             Show this help.
  --version, -v          Print the installed CLI version.

Interactive:
  If a flag is missing and stdin is a TTY, the CLI prompts for it.
  In non-TTY contexts (CI, scripts), missing required flags fail loud.

Reference: docs/tasks/phase4-011-create-plugin-generator.md`);
}

function slugify(input: string): string {
	return input
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function toCamelCaseClassName(slug: string): string {
	const words = slug.split("-").filter(Boolean);
	const name = words
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join("");
	if (/^[A-Za-z_$]/.test(name)) return name;

	const prefixBase = name.endsWith("Plugin")
		? name.slice(0, -"Plugin".length)
		: name;
	return `Plugin${prefixBase}`;
}

async function promptFor(question: string, fallback?: string): Promise<string> {
	if (!process.stdin.isTTY) {
		throw new Error(
			`Missing flag for "${question}" and stdin is not a TTY. ` +
				"Pass the value via a command-line flag for non-interactive use.",
		);
	}
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const suffix = fallback ? ` [${fallback}]` : "";
		const answer = (await rl.question(`${question}${suffix}: `)).trim();
		const result = answer || fallback || "";
		if (!result) {
			throw new Error(`A value for "${question}" is required.`);
		}
		return result;
	} finally {
		rl.close();
	}
}

async function resolveOptions(
	flags: Partial<Record<"name" | "display" | "category" | "dir", string>> & {
		readonly overwrite?: boolean;
	},
): Promise<Options> {
	let name = flags.name ?? "";
	if (!name) name = await promptFor("Package slug", "my-plugin");
	name = slugify(name);
	if (!name) throw new Error("Invalid --name (empty after slugify).");

	let display = flags.display ?? "";
	if (!display) {
		display = await promptFor(
			"Display name",
			toCamelCaseClassName(name) + " Plugin",
		);
	}

	let categoryRaw = flags.category ?? "";
	if (!categoryRaw) {
		categoryRaw = await promptFor(
			`Category (${VALID_CATEGORIES.join("/")})`,
			"custom",
		);
	}
	if (!VALID_CATEGORIES.includes(categoryRaw as Category)) {
		throw new Error(
			`Invalid --category "${categoryRaw}". Must be one of: ${VALID_CATEGORIES.join(", ")}`,
		);
	}
	const category = categoryRaw as Category;

	const dir = resolve(flags.dir ?? process.cwd(), name);
	return { name, display, category, dir, overwrite: flags.overwrite ?? false };
}

function escapeStringLiteralContent(value: string): string {
	// JSON.stringify wraps the value in quotes; slice removes them.
	// JSON allows raw U+2028/U+2029, but they're invalid in older JS
	// string literals and trip some minifiers - escape explicitly.
	return JSON.stringify(value)
		.slice(1, -1)
		.replaceAll("\u2028", "\\u2028")
		.replaceAll("\u2029", "\\u2029");
}

function toInlineText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function toMarkdownInlineText(value: string): string {
	return toInlineText(value).replace(/([\\`*_{}[\]<>()#+.!|])/g, "\\$1");
}

function toBlockCommentText(value: string): string {
	return toInlineText(value).replaceAll("*/", "* /");
}

function assertTargetDirectoryWritable(
	targetDir: string,
	overwrite: boolean,
): void {
	if (!existsSync(targetDir)) return;

	const stat = statSync(targetDir);
	if (!stat.isDirectory()) {
		throw new Error(
			`Target path already exists and is not a directory: ${targetDir}`,
		);
	}

	if (!overwrite && readdirSync(targetDir).length > 0) {
		throw new Error(
			`Target directory already exists and is not empty: ${targetDir}. ` +
				"Pass --overwrite to overwrite template files (non-template files are kept).",
		);
	}
}

function renderTemplate(
	template: string,
	opts: Options,
	className: string,
): string {
	const displayString = escapeStringLiteralContent(opts.display);
	const replacements = {
		__CATEGORY__: opts.category,
		__CLASSNAME__: className,
		__CORE_VERSION_RANGE__: CORE_VERSION_RANGE,
		__DISPLAY_COMMENT__: toBlockCommentText(opts.display),
		__DISPLAY_MARKDOWN__: toMarkdownInlineText(opts.display),
		__DISPLAY_STRING__: displayString,
		__FACTORY__: `create${className}Plugin`,
		__NAME__: opts.name,
	} satisfies Record<string, string>;

	// Single source of truth: the alternation tracks the replacement keys.
	const tokenRegex = new RegExp(Object.keys(replacements).join("|"), "g");
	return template.replace(
		tokenRegex,
		(token) => replacements[token as keyof typeof replacements],
	);
}

function copyTemplateTree(
	sourceDir: string,
	targetDir: string,
	opts: Options,
	className: string,
): void {
	mkdirSync(targetDir, { recursive: true });
	for (const entry of readdirSync(sourceDir)) {
		const sourcePath = join(sourceDir, entry);
		// Filenames go through the same substitution pipeline as contents.
		// Today only `__NAME__` appears in filenames (see
		// templates/plugin/src/__tests__/__NAME__.test.ts). Be careful
		// adding tokens whose substitution output could contain
		// file-system-unsafe characters.
		const renderedName = renderTemplate(entry, opts, className);
		const targetPath = join(targetDir, renderedName);
		const stat = statSync(sourcePath);
		if (stat.isDirectory()) {
			copyTemplateTree(sourcePath, targetPath, opts, className);
			continue;
		}
		// Only apply text-template substitution to files likely to contain
		// placeholders. Binary files (we don't ship any currently, but
		// guard so adding one doesn't silently corrupt the output) are
		// copied byte-for-byte.
		if (isTextFile(sourcePath)) {
			const content = readFileSync(sourcePath, "utf8");
			writeFileSync(
				targetPath,
				renderTemplate(content, opts, className),
				"utf8",
			);
		} else {
			copyFileSync(sourcePath, targetPath);
		}
	}
}

export async function run(
	argv: readonly string[] = process.argv.slice(2),
): Promise<Options> {
	if (!existsSync(TEMPLATE_ROOT)) {
		throw new Error(
			`Internal error: template root not found at ${TEMPLATE_ROOT}. ` +
				"This is a packaging bug - please file an issue.",
		);
	}

	const { values } = parseArgs({
		args: [...argv],
		options: {
			name: { type: "string" },
			display: { type: "string" },
			category: { type: "string" },
			dir: { type: "string" },
			overwrite: { type: "boolean" },
		},
		strict: true,
	});

	const opts = await resolveOptions({
		name: typeof values.name === "string" ? values.name : undefined,
		display: typeof values.display === "string" ? values.display : undefined,
		category: typeof values.category === "string" ? values.category : undefined,
		dir: typeof values.dir === "string" ? values.dir : undefined,
		overwrite: values.overwrite === true,
	});

	const className = toCamelCaseClassName(opts.name);
	assertTargetDirectoryWritable(opts.dir, opts.overwrite);
	copyTemplateTree(TEMPLATE_ROOT, opts.dir, opts, className);

	// Post-generation next-step hints.
	console.log(`\ncreated ${opts.dir}`);
	console.log(`  name:     ${opts.name}`);
	console.log(`  display:  ${opts.display}`);
	console.log(`  category: ${opts.category}`);
	console.log(`\nNext steps:`);
	console.log(`  cd ${opts.dir}`);
	console.log(`  pnpm install`);
	console.log(`  pnpm build`);
	console.log(`  pnpm test`);
	return opts;
}

function readPackageVersion(): string {
	try {
		const pkgPath = resolve(__dirname, "..", "package.json");
		const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
			version?: string;
		};
		return pkg.version ?? "unknown";
	} catch {
		return "unknown";
	}
}

// Only run when invoked as a CLI. `import` from tests stays side-effect-free.
const isMain =
	process.argv[1] !== undefined &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const argv = process.argv.slice(2);
	if (argv.includes("--help") || argv.includes("-h")) {
		printHelp();
		process.exit(0);
	}
	if (argv.includes("--version") || argv.includes("-v")) {
		console.log(readPackageVersion());
		process.exit(0);
	}
	run(argv).catch((err) => {
		console.error(
			`@anvilkit/create-plugin: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(1);
	});
}
