#!/usr/bin/env node
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = join(__dirname, "..");
const WORKSPACE_ROOT = join(DOCS_ROOT, "..", "..");
const COMPONENTS_SRC = join(WORKSPACE_ROOT, "packages", "components", "src");
const OUT_DIR = join(DOCS_ROOT, "content", "docs", "components");
// Central translation store (committed in the main repo). A `<slug>.<lang>.md`
// here overrides the English package README body for that locale; otherwise the
// body falls back to English (Fumadocs renders the localized headings either way).
const README_STORE = join(DOCS_ROOT, "i18n", "readmes", "components");

function localizedReadme(
	slug: string,
	lang: string,
	englishReadme: string,
): string {
	if (!lang) return englishReadme;
	const p = join(README_STORE, `${slug}.${lang}.md`);
	return existsSync(p) ? readFileSync(p, "utf8") : englishReadme;
}

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
		sf = ts.createSourceFile(
			path,
			src,
			ts.ScriptTarget.Latest,
			true,
			path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
		);
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
		if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings))
			continue;
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
	if (!resolved)
		fail(
			slug,
			`${label}: cannot resolve import "${entry.fromRelPath}" for "${name}"`,
		);
	const sf = loadSourceFile(resolved);
	const nested = collectImports(sf);
	for (const stmt of sf.statements) {
		if (!ts.isVariableStatement(stmt)) continue;
		const hasExport = stmt.modifiers?.some(
			(m) => m.kind === ts.SyntaxKind.ExportKeyword,
		);
		if (!hasExport) continue;
		for (const decl of stmt.declarationList.declarations) {
			if (
				!ts.isIdentifier(decl.name) ||
				decl.name.text !== name ||
				!decl.initializer
			)
				continue;
			return {
				found: true,
				value: evalLiteralWithResolver(
					decl.initializer,
					slug,
					`${label}←${name}`,
					nested,
					dirname(resolved),
					{},
					sf,
				),
			};
		}
	}
	fail(
		slug,
		`${label}: identifier "${name}" is not exported from "${entry.fromRelPath}"`,
	);
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

function collectLocalFunctions(
	sf: ts.SourceFile,
): Map<string, ts.FunctionDeclaration> {
	const map = new Map<string, ts.FunctionDeclaration>();
	for (const stmt of sf.statements) {
		if (ts.isFunctionDeclaration(stmt) && stmt.name) {
			map.set(stmt.name.text, stmt);
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
	const fns = sf ? collectLocalFunctions(sf) : undefined;
	const resolving = new Set<string>();
	const resolver: IdentifierResolver = (name, lbl) => {
		if (name in ctx) return ctx[name];
		if (locals?.has(name)) {
			if (resolving.has(name))
				fail(slug, `${lbl}: cyclical resolution of "${name}"`);
			resolving.add(name);
			try {
				return evalLiteralCore(
					locals.get(name)!,
					resolver,
					slug,
					`${lbl}←${name}`,
				);
			} finally {
				resolving.delete(name);
			}
		}
		const fnDecl = fns?.get(name);
		if (fnDecl) {
			// Local helper like `buildFields(t)`: evaluate its single return
			// expression with call arguments bound to the parameter names.
			return (...args: unknown[]): unknown => {
				const ret = fnDecl.body?.statements.find(
					ts.isReturnStatement,
				)?.expression;
				if (!ret)
					fail(slug, `${lbl}: function "${name}" has no return expression`);
				const paramCtx: Record<string, unknown> = { ...ctx };
				fnDecl.parameters.forEach((p, i) => {
					if (ts.isIdentifier(p.name)) paramCtx[p.name.text] = args[i];
				});
				return evalLiteralWithResolver(
					ret,
					slug,
					`${lbl}←${name}()`,
					imports,
					baseDir,
					paramCtx,
					sf,
				);
			};
		}
		const hit = resolveImportedIdentifier(name, imports, baseDir, slug, lbl);
		if (hit.found) return hit.value;
		fail(slug, `${lbl}: unresolved identifier "${name}"`);
	};
	return evalLiteralCore(node, resolver, slug, label);
}

type IdentifierResolver = (name: string, label: string) => unknown;

function evalLiteralCore(
	node: ts.Node,
	resolve: IdentifierResolver,
	slug: string,
	label: string,
): unknown {
	const recur = (n: ts.Node, lbl: string) =>
		evalLiteralCore(n, resolve, slug, lbl);
	if (
		ts.isAsExpression(node) ||
		ts.isSatisfiesExpression(node) ||
		ts.isParenthesizedExpression(node)
	) {
		return recur(node.expression, label);
	}
	if (ts.isObjectLiteralExpression(node)) {
		const obj: Record<string, unknown> = {};
		for (const prop of node.properties) {
			if (ts.isPropertyAssignment(prop)) {
				let key: string;
				if (ts.isIdentifier(prop.name) || ts.isPrivateIdentifier(prop.name)) {
					key = prop.name.text;
				} else if (
					ts.isStringLiteral(prop.name) ||
					ts.isNoSubstitutionTemplateLiteral(prop.name)
				) {
					key = prop.name.text;
				} else if (ts.isNumericLiteral(prop.name)) {
					key = prop.name.text;
				} else {
					fail(
						slug,
						`${label}: unsupported property key kind ${ts.SyntaxKind[prop.name.kind]}`,
					);
				}
				obj[key] = recur(prop.initializer, `${label}.${key}`);
			} else if (ts.isShorthandPropertyAssignment(prop)) {
				obj[prop.name.text] = resolve(
					prop.name.text,
					`${label}.${prop.name.text}`,
				);
			} else if (ts.isSpreadAssignment(prop)) {
				const value = recur(prop.expression, `${label}.<spread>`);
				if (value && typeof value === "object") Object.assign(obj, value);
				else fail(slug, `${label}: spread of non-object`);
			} else {
				fail(
					slug,
					`${label}: unsupported property ${ts.SyntaxKind[prop.kind]}`,
				);
			}
		}
		return obj;
	}
	if (ts.isArrayLiteralExpression(node)) {
		return node.elements.map((el, i) => recur(el, `${label}[${i}]`));
	}
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
		return node.text;
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
	if (ts.isCallExpression(node)) {
		// Calls like `createT()` / `buildFields(defaultT)` / `t("key")` where the
		// callee resolves to a statically-known function (seeded in ctx or a
		// local function declaration).
		if (ts.isIdentifier(node.expression)) {
			const callee = resolve(node.expression.text, label);
			if (typeof callee === "function") {
				const args = node.arguments.map((a, i) =>
					recur(a, `${label}.args[${i}]`),
				);
				return (callee as (...a: unknown[]) => unknown)(...args);
			}
			fail(
				slug,
				`${label}: call target "${node.expression.text}" is not statically evaluable`,
			);
		}
		fail(slug, `${label}: unsupported call expression`);
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

	// The i18n factory pattern exports `fields = buildFields(createT())`. Docs
	// render the English defaults, so back `createT` with the package's en
	// catalog instead of statically evaluating src/i18n.ts.
	const enCatalogPath = join(pkgDir, "i18n", "messages", "en.json");
	if (existsSync(enCatalogPath)) {
		const enCatalog = JSON.parse(readFileSync(enCatalogPath, "utf8")) as Record<
			string,
			string
		>;
		ctx.createT =
			() =>
			(key: string): string => {
				const value = enCatalog[key];
				if (typeof value !== "string")
					fail(slug, `i18n: missing en catalog key "${key}"`);
				return value;
			};
	}

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
			if (name === "metadata")
				metadata = evalDecl(decl.initializer, "metadata") as Metadata;
			else if (name === "fields")
				fields = evalDecl(decl.initializer, "fields") as Fields;
			else if (name === "defaultProps")
				defaultProps = evalDecl(
					decl.initializer,
					"defaultProps",
				) as DefaultProps;
		}
	}

	if (!metadata) fail(slug, "config.ts is missing `export const metadata`");
	if (!fields) fail(slug, "config.ts is missing `export const fields`");
	if (!defaultProps)
		fail(slug, "config.ts is missing `export const defaultProps`");

	for (const key of [
		"componentName",
		"componentSlug",
		"packageName",
		"packageVersion",
		"scaffoldType",
		"schemaVersion",
	] as const) {
		if (
			metadata[key] === undefined ||
			metadata[key] === null ||
			metadata[key] === ""
		) {
			fail(slug, `metadata.${key} is missing or empty`);
		}
	}
	if (metadata.componentSlug !== slug) {
		fail(
			slug,
			`metadata.componentSlug "${metadata.componentSlug}" does not match directory "${slug}"`,
		);
	}
	if (metadata.packageName !== pkgJson.name) {
		fail(
			slug,
			`metadata.packageName "${metadata.packageName}" does not match package.json name "${pkgJson.name}"`,
		);
	}

	const pkgDescription =
		pkgJson.description && pkgJson.description.trim().length > 0
			? pkgJson.description.trim()
			: extractReadmeSummary(readme) ||
				`${metadata.componentName} component for Puck.`;

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

// "" is the default English locale (unsuffixed filename); the rest are prefixed
// and use a `.{lang}.mdx` suffix (Fumadocs `parser: 'dot'`). Generator-controlled
// boilerplate is translated; each component's README body + Puck schema stay as
// emitted (sourced from the package). Translations live here so they survive
// regeneration.
const LOCALES = ["", "zh", "ja", "ko"] as const;
type Locale = (typeof LOCALES)[number];

const T: Record<
	Locale,
	{
		sectionTitle: string;
		sectionDesc: string;
		indexLead: string;
		indexPlayground: string;
		indexAuthoring: string;
		colComponent: string;
		colPackage: string;
		colSummary: string;
		playgroundCta: string;
		livePreview: string;
		propReference: string;
		propLead: string;
		colField: string;
		colType: string;
		colDefault: string;
		defaultProps: string;
		puckConfig: string;
	}
> = {
	"": {
		sectionTitle: "Components",
		sectionDesc:
			"Auto-generated catalog of every @anvilkit/* Puck-native component package.",
		indexLead:
			"This catalog is regenerated from each component's `metadata` export and `README.md`\non every docs build — see `apps/docs/scripts/generate-component-pages.ts`.",
		indexPlayground:
			"Prefer to explore interactively? [Open the playground](/playground) to drop any of\nthese 11 components onto a live Puck canvas.",
		indexAuthoring:
			"Writing your own? Start with the [component authoring guide](/guides/component-authoring).",
		colComponent: "Component",
		colPackage: "Package",
		colSummary: "Summary",
		playgroundCta: "Try it in the playground →",
		livePreview: "Live preview",
		propReference: "Prop reference",
		propLead: "Derived from the component's Puck `fields` schema.",
		colField: "Field",
		colType: "Type",
		colDefault: "Default",
		defaultProps: "Default props",
		puckConfig: "Puck config",
	},
	zh: {
		sectionTitle: "组件",
		sectionDesc: "自动生成的所有 @anvilkit/* Puck 原生组件包目录。",
		indexLead:
			"此目录在每次构建文档时，都会根据每个组件的 `metadata` 导出和 `README.md`\n重新生成 —— 参见 `apps/docs/scripts/generate-component-pages.ts`。",
		indexPlayground:
			"想要交互式探索？[打开演练场](/playground) 即可将这 11 个组件中的任意一个\n拖放到实时的 Puck 画布上。",
		indexAuthoring:
			"想编写自己的组件？请从 [组件编写指南](/zh/guides/component-authoring) 开始。",
		colComponent: "组件",
		colPackage: "包",
		colSummary: "摘要",
		playgroundCta: "在演练场中试用 →",
		livePreview: "实时预览",
		propReference: "属性参考",
		propLead: "派生自该组件的 Puck `fields` 模式。",
		colField: "字段",
		colType: "类型",
		colDefault: "默认值",
		defaultProps: "默认属性",
		puckConfig: "Puck 配置",
	},
	ja: {
		sectionTitle: "コンポーネント",
		sectionDesc:
			"すべての @anvilkit/* Puck ネイティブコンポーネントパッケージの自動生成カタログ。",
		indexLead:
			"このカタログは、ドキュメントをビルドするたびに各コンポーネントの `metadata` エクスポートと `README.md` から\n再生成されます — `apps/docs/scripts/generate-component-pages.ts` を参照してください。",
		indexPlayground:
			"インタラクティブに試したいですか？[プレイグラウンドを開く](/playground)と、これら 11 個の\nコンポーネントを実際の Puck キャンバスに配置できます。",
		indexAuthoring:
			"独自に作成しますか？[コンポーネント作成ガイド](/ja/guides/component-authoring)から始めてください。",
		colComponent: "コンポーネント",
		colPackage: "パッケージ",
		colSummary: "概要",
		playgroundCta: "プレイグラウンドで試す →",
		livePreview: "ライブプレビュー",
		propReference: "プロパティリファレンス",
		propLead: "コンポーネントの Puck `fields` スキーマから導出されます。",
		colField: "フィールド",
		colType: "型",
		colDefault: "デフォルト",
		defaultProps: "デフォルトプロパティ",
		puckConfig: "Puck 設定",
	},
	ko: {
		sectionTitle: "컴포넌트",
		sectionDesc:
			"모든 @anvilkit/* Puck 네이티브 컴포넌트 패키지의 자동 생성 카탈로그.",
		indexLead:
			"이 카탈로그는 문서를 빌드할 때마다 각 컴포넌트의 `metadata` 익스포트와 `README.md`에서\n다시 생성됩니다 — `apps/docs/scripts/generate-component-pages.ts` 참조.",
		indexPlayground:
			"인터랙티브하게 살펴보고 싶으신가요? [플레이그라운드 열기](/playground)에서 이 11개\n컴포넌트를 실제 Puck 캔버스에 끌어다 놓아 보세요.",
		indexAuthoring:
			"직접 작성하시나요? [컴포넌트 작성 가이드](/ko/guides/component-authoring)부터 시작하세요.",
		colComponent: "컴포넌트",
		colPackage: "패키지",
		colSummary: "요약",
		playgroundCta: "플레이그라운드에서 사용해 보기 →",
		livePreview: "라이브 미리보기",
		propReference: "속성 레퍼런스",
		propLead: "컴포넌트의 Puck `fields` 스키마에서 파생됩니다.",
		colField: "필드",
		colType: "타입",
		colDefault: "기본값",
		defaultProps: "기본 속성",
		puckConfig: "Puck 설정",
	},
};

// Localized page description. English keeps the package's own description; other
// locales wrap the component's display name in a translated sentence.
function localizedDescription(
	lang: Locale,
	componentName: string,
	pkgDescription: string,
): string {
	switch (lang) {
		case "zh":
			return `Anvilkit Puck 原生 ${componentName} 组件。`;
		case "ja":
			return `Anvilkit Puck ネイティブの ${componentName} コンポーネント。`;
		case "ko":
			return `Anvilkit Puck 네이티브 ${componentName} 컴포넌트.`;
		default:
			return pkgDescription;
	}
}

function fileName(slug: string, lang: Locale): string {
	return lang ? `${slug}.${lang}.mdx` : `${slug}.mdx`;
}

// Locale-prefix an internal component href (default locale unchanged).
function localizeComponentHref(slug: string, lang: Locale): string {
	return lang ? `/${lang}/components/${slug}` : `/components/${slug}`;
}

function buildPropsTable(
	fields: Fields,
	defaultProps: DefaultProps,
	lang: Locale,
): string {
	const t = T[lang];
	const rows: string[] = [
		`| ${t.colField} | ${t.colType} | ${t.colDefault} |`,
		"|-------|------|---------|",
	];
	for (const [name, field] of Object.entries(fields)) {
		const type = fieldTypeLabel(field);
		rows.push(
			`| \`${name}\` | ${type} | ${formatDefault(defaultProps[name])} |`,
		);
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

function renderMdx(info: ComponentInfo, lang: Locale): string {
	const {
		componentName,
		pkgName,
		pkgVersion,
		pkgDescription,
		defaultProps,
		fields,
		readme,
	} = info;

	const t = T[lang];
	const readmeBody = stripReadmeHeading(
		localizedReadme(info.slug, lang, readme),
	);
	const propsTable = buildPropsTable(fields, defaultProps, lang);
	const puckJson = buildPuckConfigJson(info);
	const defaultPropsJson = JSON.stringify(defaultProps, null, 2);
	const description = localizedDescription(lang, componentName, pkgDescription);
	// The playground is not localized — keep the link unprefixed in every locale.
	const playgroundHref = "/playground";

	return `---
title: ${componentName}
description: ${JSON.stringify(description)}
---

<div className="anvilkit-component-meta">
	<code>${pkgName}</code> <span>·</span> <span>v${pkgVersion}</span> <span>·</span> <a href="${playgroundHref}">${t.playgroundCta}</a>
</div>

## ${t.livePreview}

<ComponentPreview name="${componentName}" />

${readmeBody}

## ${t.propReference}

${t.propLead}

${propsTable}

## ${t.defaultProps}

\`\`\`json
${defaultPropsJson}
\`\`\`

## ${t.puckConfig}

\`\`\`json
${puckJson}
\`\`\`
`;
}

function writePage(info: ComponentInfo): void {
	for (const lang of LOCALES) {
		writeFileSync(
			join(OUT_DIR, fileName(info.slug, lang)),
			renderMdx(info, lang),
			"utf8",
		);
	}
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

	for (const lang of LOCALES) {
		writeFileSync(
			join(OUT_DIR, lang ? `index.${lang}.mdx` : "index.mdx"),
			renderIndex(results, lang),
			"utf8",
		);
		// Fumadocs nav metadata (localized section title).
		writeFileSync(
			join(OUT_DIR, lang ? `meta.${lang}.json` : "meta.json"),
			`${JSON.stringify({ title: T[lang].sectionTitle, pages: ["index", "..."] }, null, "\t")}\n`,
			"utf8",
		);
	}
	console.log(
		`[generate-component-pages] ${results.length} pages × ${LOCALES.length} locales + index + meta.json`,
	);
}

function renderIndex(all: ComponentInfo[], lang: Locale): string {
	const t = T[lang];
	const rows = all
		.map((info) => {
			const href = localizeComponentHref(info.slug, lang);
			const summary = localizedDescription(
				lang,
				info.componentName,
				info.pkgDescription,
			);
			return `| [${info.componentName}](${href}) | \`${info.pkgName}\` | ${summary} |`;
		})
		.join("\n");
	return `---
title: ${JSON.stringify(t.sectionTitle)}
description: ${JSON.stringify(t.sectionDesc)}
---

${t.indexLead}

${t.indexPlayground}

${t.indexAuthoring}

| ${t.colComponent} | ${t.colPackage} | ${t.colSummary} |
|-----------|---------|---------|
${rows}
`;
}

main();
