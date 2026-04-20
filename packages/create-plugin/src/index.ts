#!/usr/bin/env node
/**
 * create-anvilkit-plugin — scaffold a ready-to-build StudioPlugin
 * package. Two invocation shapes work:
 *
 *   pnpm dlx create-anvilkit-plugin --name my-plugin \
 *                                   --display "My Plugin" \
 *                                   --category rail-panel
 *
 *   pnpm create anvilkit-plugin  (interactive)
 *
 * Flags accepted: --name, --display, --category, --dir, --help.
 * Missing flags are prompted for when stdin is a TTY; otherwise
 * the CLI errors so CI invocations fail loud.
 *
 * Reference: phase4-011.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Shipped alongside `dist/` in the published tarball. */
const TEMPLATE_ROOT = resolve(__dirname, "..", "templates", "plugin");

const VALID_CATEGORIES = ["export", "ai", "rail-panel", "custom"] as const;
type Category = (typeof VALID_CATEGORIES)[number];

interface Options {
	readonly name: string;
	readonly display: string;
	readonly category: Category;
	readonly dir: string;
}

function printHelp(): void {
	console.log(`create-anvilkit-plugin — scaffold an Anvilkit StudioPlugin

Usage:
  create-anvilkit-plugin [flags]

Flags:
  --name <slug>          Package slug (e.g. my-plugin). Becomes the folder name.
  --display <label>      Human-readable plugin name (e.g. "My Plugin").
  --category <category>  One of: ${VALID_CATEGORIES.join(", ")}
  --dir <path>           Target directory (default: current working dir).
  --help                 Show this help.

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
	return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
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
		return answer || fallback || "";
	} finally {
		rl.close();
	}
}

async function resolveOptions(
	flags: Partial<Record<"name" | "display" | "category" | "dir", string>>,
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
	const category = VALID_CATEGORIES.includes(categoryRaw as Category)
		? (categoryRaw as Category)
		: (() => {
				throw new Error(
					`Invalid --category "${categoryRaw}". Must be one of: ${VALID_CATEGORIES.join(", ")}`,
				);
			})();

	const dir = resolve(flags.dir ?? process.cwd(), name);
	return { name, display, category, dir };
}

function renderTemplate(
	template: string,
	opts: Options,
	className: string,
): string {
	return template
		.replaceAll("__NAME__", opts.name)
		.replaceAll("__DISPLAY__", opts.display)
		.replaceAll("__CATEGORY__", opts.category)
		.replaceAll("__CLASSNAME__", className)
		.replaceAll(
			"__FACTORY__",
			`create${className}Plugin`,
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
		// Template file names can contain __NAME__ etc. too.
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
		const textExtensions = [
			".json",
			".ts",
			".md",
			".mjs",
			".cjs",
			".yml",
			".yaml",
			".js",
		];
		const isText = textExtensions.some((ext) => sourcePath.endsWith(ext));
		if (isText) {
			const content = readFileSync(sourcePath, "utf8");
			writeFileSync(targetPath, renderTemplate(content, opts, className), "utf8");
		} else {
			copyFileSync(sourcePath, targetPath);
		}
	}
}

export async function run(argv: readonly string[] = process.argv.slice(2)): Promise<Options> {
	if (argv.includes("--help") || argv.includes("-h")) {
		printHelp();
		process.exit(0);
	}

	const { values } = parseArgs({
		args: [...argv],
		options: {
			name: { type: "string" },
			display: { type: "string" },
			category: { type: "string" },
			dir: { type: "string" },
		},
		strict: false,
	});

	const opts = await resolveOptions({
		name: typeof values.name === "string" ? values.name : undefined,
		display: typeof values.display === "string" ? values.display : undefined,
		category: typeof values.category === "string" ? values.category : undefined,
		dir: typeof values.dir === "string" ? values.dir : undefined,
	});

	const className = toCamelCaseClassName(opts.name);
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

// Only run when invoked as a CLI. `import` from tests stays side-effect-free.
const isMain =
	process.argv[1] !== undefined &&
	resolve(process.argv[1]) === resolve(__filename);
if (isMain) {
	run().catch((err) => {
		console.error(`create-anvilkit-plugin: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	});
}
