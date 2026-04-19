#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = join(__dirname, "..");
const WORKSPACE_ROOT = join(DOCS_ROOT, "..", "..");
const COMPONENTS_SRC = join(WORKSPACE_ROOT, "packages", "components", "src");
const OUT_DIR = join(DOCS_ROOT, "src", "content", "docs", "components");

const SLUGS = [
	"bento-grid",
	"blog-list",
	"button",
	"helps",
	"hero",
	"input",
	"logo-clouds",
	"navbar",
	"pricing-minimal",
	"section",
	"statistics",
] as const;

type Slug = (typeof SLUGS)[number];

type Metadata = {
	componentName: string;
	componentSlug: string;
	packageName: string;
	packageVersion: string;
	scaffoldType: string;
	schemaVersion: number;
	suggestedCategory?: string;
};

type PuckField = {
	type: string;
	label?: string;
	options?: Array<{ label: string; value: unknown }>;
	arrayFields?: Record<string, PuckField>;
	objectFields?: Record<string, PuckField>;
	[key: string]: unknown;
};

type Fields = Record<string, PuckField>;
type DefaultProps = Record<string, unknown>;

type ComponentInfo = {
	slug: Slug;
	metadata: Metadata;
	fields: Fields;
	defaultProps: DefaultProps;
	pkgName: string;
	pkgVersion: string;
	pkgDescription: string;
	readme: string;
	componentName: string;
};

function fail(slug: string, msg: string): never {
	console.error(`[generate-component-pages] ${slug}: ${msg}`);
	process.exit(1);
}

type ImportMap = Map<string, { fromRelPath: string }>;

const sourceCache = new Map<string, ts.SourceFile>();

function loadSourceFile(path: string): ts.SourceFile {
	let sf = sourceCache.get(path);
	if (!sf) {
		const src = readFileSync(path, "utf8");
		sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
		sourceCache.set(path, sf);
	}
	return sf;
}

function collectImports(sf: ts.SourceFile): ImportMap {
	const map: ImportMap = new Map();
	for (const stmt of sf.statements) {
		if (!ts.isImportDeclaration(stmt)) continue;
		if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
		const from = stmt.moduleSpecifier.text;
		if (!from.startsWith(".")) continue; // only track local imports
		const clause = stmt.importClause;
		if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
		// biome-ignore lint/suspicious/noExplicitAny: ts.ImportClause.isTypeOnly is deprecated in TS 6 but no replacement surfaces a single boolean; cast narrowly here.
		if ((clause as any).isTypeOnly) continue;
		for (const spec of clause.namedBindings.elements) {
			if (spec.isTypeOnly) continue;
			map.set(spec.name.text, { fromRelPath: from });
		}
	}
	return map;
}

function resolveImportedIdentifier(
	name: string,
	imports: ImportMap,
	baseDir: string,
	slug: string,
	label: string,
): { found: true; value: unknown } | { found: false } {
	const entry = imports.get(name);
	if (!entry) return { found: false };
	const candidates = [".tsx", ".ts"].flatMap((ext) => [
		join(baseDir, `${entry.fromRelPath}${ext}`),
		join(baseDir, entry.fromRelPath, `index${ext}`),
	]);
	const resolved = candidates.find((c) => existsSync(c));
	if (!resolved) fail(slug, `${label}: cannot resolve import "${entry.fromRelPath}" for "${name}"`);
	const sf = loadSourceFile(resolved);
	const nested = collectImports(sf);
	for (const stmt of sf.statements) {
		if (!ts.isVariableStatement(stmt)) continue;
		const hasExport = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
		if (!hasExport) continue;
		for (const decl of stmt.declarationList.declarations) {
			if (!ts.isIdentifier(decl.name) || decl.name.text !== name || !decl.initializer) continue;
			return {
				found: true,
				value: evalLiteralWithResolver(decl.initializer, slug, `${label}←${name}`, nested, dirname(resolved), {}, sf),
			};
		}
	}
	fail(slug, `${label}: identifier "${name}" is not exported from "${entry.fromRelPath}"`);
}

function collectLocalConsts(sf: ts.SourceFile): Map<string, ts.Expression> {
	const map = new Map<string, ts.Expression>();
	for (const stmt of sf.statements) {
		if (!ts.isVariableStatement(stmt)) continue;
		for (const decl of stmt.declarationList.declarations) {
			if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
			map.set(decl.name.text, decl.initializer);
		}
	}
	return map;
}

function evalLiteralWithResolver(
	node: ts.Node,
	slug: string,
	label: string,
	imports: ImportMap,
	baseDir: string,
	ctx: Record<string, unknown> = {},
	sf?: ts.SourceFile,
): unknown {
	const locals = sf ? collectLocalConsts(sf) : undefined;
	const resolving = new Set<string>();
	const resolver: IdentifierResolver = (name, lbl) => {
		if (name in ctx) return ctx[name];
		if (locals?.has(name)) {
			if (resolving.has(name)) fail(slug, `${lbl}: cyclical resolution of "${name}"`);
			resolving.add(name);
			try {
				return evalLiteralCore(locals.get(name)!, resolver, slug, `${lbl}←${name}`);
			} finally {
				resolving.delete(name);
			}
		}
		const hit = resolveImportedIdentifier(name, imports, baseDir, slug, lbl);
		if (hit.found) return hit.value;
		fail(slug, `${lbl}: unresolved identifier "${name}"`);
	};
	return evalLiteralCore(node, resolver, slug, label);
}

type IdentifierResolver = (name: string, label: string) => unknown;

function evalLiteralCore(node: ts.Node, resolve: IdentifierResolver, slug: string, label: string): unknown {
	const recur = (n: ts.Node, lbl: string) => evalLiteralCore(n, resolve, slug, lbl);
	if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
		return recur(node.expression, label);
	}
	if (ts.isObjectLiteralExpression(node)) {
		const obj: Record<string, unknown> = {};
		for (const prop of node.properties) {
			if (ts.isPropertyAssignment(prop)) {
				let key: string;
				if (ts.isIdentifier(prop.name) || ts.isPrivateIdentifier(prop.name)) {
					key = prop.name.text;
				} else if (ts.isStringLiteral(prop.name) || ts.isNoSubstitutionTemplateLiteral(prop.name)) {
					key = prop.name.text;
				} else if (ts.isNumericLiteral(prop.name)) {
					key = prop.name.text;
				} else {
					fail(slug, `${label}: unsupported property key kind ${ts.SyntaxKind[prop.name.kind]}`);
				}
				obj[key] = recur(prop.initializer, `${label}.${key}`);
			} else if (ts.isShorthandPropertyAssignment(prop)) {
				obj[prop.name.text] = resolve(prop.name.text, `${label}.${prop.name.text}`);
			} else if (ts.isSpreadAssignment(prop)) {
				const value = recur(prop.expression, `${label}.<spread>`);
				if (value && typeof value === "object") Object.assign(obj, value);
				else fail(slug, `${label}: spread of non-object`);
			} else {
				fail(slug, `${label}: unsupported property ${ts.SyntaxKind[prop.kind]}`);
			}
		}
		return obj;
	}
	if (ts.isArrayLiteralExpression(node)) {
		return node.elements.map((el, i) => recur(el, `${label}[${i}]`));
	}
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
	if (ts.isNumericLiteral(node)) return Number(node.text);
	if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
	if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
	if (node.kind === ts.SyntaxKind.NullKeyword) return null;
	if (node.kind === ts.SyntaxKind.UndefinedKeyword) return undefined;
	if (ts.isPrefixUnaryExpression(node)) {
		const v = recur(node.operand, label);
		if (node.operator === ts.SyntaxKind.MinusToken) return -(v as number);
		if (node.operator === ts.SyntaxKind.PlusToken) return +(v as number);
		if (node.operator === ts.SyntaxKind.ExclamationToken) return !v;
		fail(slug, `${label}: unsupported prefix operator`);
	}
	if (ts.isIdentifier(node)) {
		if (node.text === "undefined") return undefined;
		return resolve(node.text, label);
	}
	if (ts.isPropertyAccessExpression(node)) {
		const obj = recur(node.expression, label) as Record<string, unknown>;
		return obj?.[node.name.text];
	}
	if (ts.isTemplateExpression(node)) {
		let s = node.head.text;
		for (const span of node.templateSpans) {
			s += String(recur(span.expression, label));
			s += span.literal.text;
		}
		return s;
	}
	if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
		// Puck field schemas legitimately contain callbacks (e.g. getItemSummary,
		// resolveFields). They aren't serializable, so we record a placeholder
		// so JSON output stays lossless-by-shape without executing code.
		return "[[Function]]";
	}
	fail(slug, `${label}: unsupported node kind ${ts.SyntaxKind[node.kind]}`);
}

function parseComponent(slug: Slug): ComponentInfo {
	const pkgDir = join(COMPONENTS_SRC, slug);
	const configPath = join(pkgDir, "src", "config.ts");
	const readmePath = join(pkgDir, "README.md");
	const pkgJsonPath = join(pkgDir, "package.json");

	if (!existsSync(configPath)) fail(slug, `missing ${configPath}`);
	if (!existsSync(readmePath)) fail(slug, `missing ${readmePath}`);
	if (!existsSync(pkgJsonPath)) fail(slug, `missing ${pkgJsonPath}`);

	const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
		name: string;
		version: string;
		description?: string;
	};
	const readme = readFileSync(readmePath, "utf8");
	const sf = loadSourceFile(configPath);
	const imports = collectImports(sf);
	const configDir = dirname(configPath);

	const ctx: Record<string, unknown> = {
		packageJson: { name: pkgJson.name, version: pkgJson.version },
	};

	let metadata: Metadata | undefined;
	let fields: Fields | undefined;
	let defaultProps: DefaultProps | undefined;

	const evalDecl = (init: ts.Expression, label: string): unknown =>
		evalLiteralWithResolver(init, slug, label, imports, configDir, ctx, sf);

	for (const stmt of sf.statements) {
		if (!ts.isVariableStatement(stmt)) continue;
		for (const decl of stmt.declarationList.declarations) {
			if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
			const name = decl.name.text;
			if (name === "metadata") metadata = evalDecl(decl.initializer, "metadata") as Metadata;
			else if (name === "fields") fields = evalDecl(decl.initializer, "fields") as Fields;
			else if (name === "defaultProps")
				defaultProps = evalDecl(decl.initializer, "defaultProps") as DefaultProps;
		}
	}

	if (!metadata) fail(slug, "config.ts is missing `export const metadata`");
	if (!fields) fail(slug, "config.ts is missing `export const fields`");
	if (!defaultProps) fail(slug, "config.ts is missing `export const defaultProps`");

	for (const key of [
		"componentName",
		"componentSlug",
		"packageName",
		"packageVersion",
		"scaffoldType",
		"schemaVersion",
	] as const) {
		if (metadata[key] === undefined || metadata[key] === null || metadata[key] === "") {
			fail(slug, `metadata.${key} is missing or empty`);
		}
	}
	if (metadata.componentSlug !== slug) {
		fail(slug, `metadata.componentSlug "${metadata.componentSlug}" does not match directory "${slug}"`);
	}
	if (metadata.packageName !== pkgJson.name) {
		fail(slug, `metadata.packageName "${metadata.packageName}" does not match package.json name "${pkgJson.name}"`);
	}

	const pkgDescription =
		pkgJson.description && pkgJson.description.trim().length > 0
			? pkgJson.description.trim()
			: extractReadmeSummary(readme) || `${metadata.componentName} component for Puck.`;

	return {
		slug,
		metadata,
		fields,
		defaultProps,
		pkgName: pkgJson.name,
		pkgVersion: pkgJson.version,
		pkgDescription,
		readme,
		componentName: metadata.componentName,
	};
}

function extractReadmeSummary(readme: string): string {
	const lines = readme.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line || line.startsWith("#")) continue;
		return line;
	}
	return "";
}

function stripReadmeHeading(readme: string): string {
	const lines = readme.split("\n");
	let i = 0;
	while (i < lines.length && lines[i].trim() === "") i++;
	if (i < lines.length && lines[i].startsWith("# ")) {
		i++;
		while (i < lines.length && lines[i].trim() === "") i++;
	}
	return lines.slice(i).join("\n").trimEnd();
}

function escapeYaml(value: string): string {
	return value.replace(/"/g, '\\"');
}

function formatDefault(value: unknown): string {
	if (value === undefined) return "—";
	const json = JSON.stringify(value);
	if (json === undefined) return "—";
	const short = json.length > 60 ? `${json.slice(0, 57)}…` : json;
	return `\`${short.replace(/\|/g, "\\|")}\``;
}

function fieldTypeLabel(field: PuckField): string {
	if (field.type === "radio" || field.type === "select") {
		const options = Array.isArray(field.options) ? field.options : [];
		const values = options.map((o) => JSON.stringify(o.value)).join(" \\| ");
		return values ? `${field.type} (${values})` : field.type;
	}
	if (field.type === "array") return "array";
	if (field.type === "object") return "object";
	return field.type;
}

function buildPropsTable(fields: Fields, defaultProps: DefaultProps): string {
	const rows: string[] = [
		"| Field | Type | Default |",
		"|-------|------|---------|",
	];
	for (const [name, field] of Object.entries(fields)) {
		const type = fieldTypeLabel(field);
		rows.push(`| \`${name}\` | ${type} | ${formatDefault(defaultProps[name])} |`);
	}
	return rows.join("\n");
}

function buildPuckConfigJson(info: ComponentInfo): string {
	const payload = {
		label: info.componentName,
		metadata: info.metadata,
		defaultProps: info.defaultProps,
		fields: info.fields,
	};
	return JSON.stringify(payload, null, 2);
}

function renderMdx(info: ComponentInfo): string {
	const {
		componentName,
		pkgName,
		pkgVersion,
		pkgDescription,
		defaultProps,
		fields,
		readme,
	} = info;

	const readmeBody = stripReadmeHeading(readme);
	const propsTable = buildPropsTable(fields, defaultProps);
	const puckJson = buildPuckConfigJson(info);
	const defaultPropsJson = JSON.stringify(defaultProps, null, 2);

	return `---
title: ${componentName}
description: "${escapeYaml(pkgDescription)}"
sidebar:
  label: ${componentName}
editUrl: false
---
import { ${componentName}, defaultProps as __anvilkitDefaultProps } from "${pkgName}";
import "${pkgName}/styles.css";

<div class="anvilkit-component-meta">
	<code>${pkgName}</code> <span>·</span> <span>v${pkgVersion}</span> <span>·</span> <a href="/playground/">Try it in the playground →</a>
</div>

## Live preview

<div class="not-content anvilkit-component-preview">
	<${componentName} client:only="react" {...__anvilkitDefaultProps} />
</div>

${readmeBody}

## Prop reference

Derived from the component's Puck \`fields\` schema.

${propsTable}

## Default props

\`\`\`json
${defaultPropsJson}
\`\`\`

## Puck config

\`\`\`json
${puckJson}
\`\`\`
`;
}

function writePage(info: ComponentInfo): void {
	const outPath = join(OUT_DIR, `${info.slug}.mdx`);
	writeFileSync(outPath, renderMdx(info), "utf8");
}

function clearOutDir(): void {
	if (existsSync(OUT_DIR)) {
		for (const entry of readdirSync(OUT_DIR)) {
			if (entry.endsWith(".mdx") || entry.endsWith(".md")) {
				rmSync(join(OUT_DIR, entry));
			}
		}
	} else {
		mkdirSync(OUT_DIR, { recursive: true });
	}
}

function main(): void {
	clearOutDir();
	const results: ComponentInfo[] = [];
	for (const slug of SLUGS) {
		const info = parseComponent(slug);
		writePage(info);
		results.push(info);
		console.log(`[generate-component-pages] wrote components/${slug}.mdx`);
	}

	const indexPath = join(OUT_DIR, "index.mdx");
	const indexBody = renderIndex(results);
	writeFileSync(indexPath, indexBody, "utf8");
	console.log(`[generate-component-pages] wrote components/index.mdx`);
	console.log(`[generate-component-pages] ${results.length} pages generated`);
}

function renderIndex(all: ComponentInfo[]): string {
	const rows = all
		.map(
			(info) =>
				`| [${info.componentName}](/components/${info.slug}/) | \`${info.pkgName}\` | ${info.pkgDescription} |`,
		)
		.join("\n");
	return `---
title: Components
description: Auto-generated catalog of every @anvilkit/* Puck-native component package.
---

This catalog is regenerated from each component's \`metadata\` export and \`README.md\`
on every docs build — see \`apps/docs/scripts/generate-component-pages.ts\`.

Prefer to explore interactively? [Open the playground](/playground/) to drop any of
these 11 components onto a live Puck canvas.

| Component | Package | Summary |
|-----------|---------|---------|
${rows}
`;
}

main();
