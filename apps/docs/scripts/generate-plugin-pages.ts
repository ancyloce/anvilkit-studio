#!/usr/bin/env node
/**
 * Generate the `/plugins` documentation section from the source-of-truth in each
 * plugin package (`packages/plugins/plugin-<slug>`).
 *
 * For every plugin this emits one MDX page per locale plus a section index and
 * Fumadocs `meta.json` nav files — mirroring `generate-component-pages.ts` and
 * `generate-template-pages.mjs`. The page is assembled from facts that are
 * guaranteed correct (read from the package, never hand-typed):
 *
 *   - `package.json`        → name, version, description, peer/anvilkit deps,
 *                             subpath entry points (`exports` keys)
 *   - `meta/config.json`    → display name + `capabilities` (sidebar/header)
 *   - `src/index.ts`        → the public API export surface (parsed with the TS
 *                             compiler API, classified by export kind)
 *   - `README.md`           → the human-authored guide body (overview, usage,
 *                             advanced scenarios, FAQ) injected verbatim
 *
 * i18n: generator-controlled boilerplate (section headings, table headers, kind
 * labels) is translated below via `T`; this survives regeneration. The README
 * body is locale-agnostic by default but a per-plugin translation override is
 * honoured when present: `README.zh.md` / `README.ja.md` / `README.ko.md` in the
 * plugin root take precedence over the English `README.md` for that locale, so
 * narratives can be translated incrementally without forking this script.
 *
 * Wired via `generate:plugins` and folded into `generate:all`.
 */
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
const PLUGINS_ROOT = join(WORKSPACE_ROOT, "packages", "plugins");
const OUT_DIR = join(DOCS_ROOT, "content", "docs", "plugins");

function fail(slug: string, msg: string): never {
	console.error(`[generate-plugin-pages] ${slug}: ${msg}`);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PluginMeta = {
	id?: string;
	name?: string;
	description?: string;
	capabilities?: { sidebar?: boolean; header?: boolean };
};

type ExportKind =
	| "factory"
	| "hook"
	| "component"
	| "util"
	| "constant"
	| "type";

type ExportEntry = { name: string; kind: ExportKind };

type PeerDep = { name: string; range: string; optional: boolean };

type Subpath = { path: string; wildcard: boolean };

type PluginInfo = {
	slug: string;
	displayName: string;
	pkgName: string;
	version: string;
	description: string;
	category: PluginCategory;
	capability: CapabilityKey;
	peerDeps: PeerDep[];
	anvilkitDeps: string[];
	subpaths: Subpath[];
	exports: ExportEntry[];
	primaryFactory?: string;
	repository?: string;
	readme: Record<Locale, string>;
};

// ---------------------------------------------------------------------------
// Categories — reuse the registry feed's taxonomy verbatim so docs and
// `registry/feed.json` never disagree (generate-registry-feed.mjs).
// ---------------------------------------------------------------------------

type PluginCategory = "ai" | "assets" | "export" | "history" | "studio";

function pluginCategory(slug: string): PluginCategory {
	if (slug === "plugin-ai-copilot") return "ai";
	if (slug === "plugin-asset-manager") return "assets";
	if (slug.startsWith("plugin-export-")) return "export";
	if (slug === "plugin-version-history") return "history";
	return "studio";
}

type CapabilityKey = "sidebar" | "header" | "headless";

// ---------------------------------------------------------------------------
// Reading sources
// ---------------------------------------------------------------------------

function listPluginSlugs(): string[] {
	if (!existsSync(PLUGINS_ROOT)) return [];
	const blocked = new Set(["node_modules", "dist", "scripts"]);
	return readdirSync(PLUGINS_ROOT, { withFileTypes: true })
		.filter(
			(d) => d.isDirectory() && !blocked.has(d.name) && !d.name.startsWith("."),
		)
		.map((d) => d.name)
		.filter((name) => existsSync(join(PLUGINS_ROOT, name, "package.json")))
		.sort();
}

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

function classifyValue(name: string): Exclude<ExportKind, "type"> {
	if (/^create[A-Z]/.test(name)) return "factory";
	if (/^use[A-Z]/.test(name)) return "hook";
	// SCREAMING_SNAKE / ALL-CAPS constants (incl. event-name strings, defaults).
	if (/^[A-Z][A-Z0-9_]*$/.test(name)) return "constant";
	// PascalCase value → React component, provider, or class (incl. *Error).
	if (/^[A-Z]/.test(name)) return "component";
	// camelCase value → helper function / adapter / format object.
	return "util";
}

function hasExportModifier(node: ts.Node): boolean {
	// biome-ignore lint/suspicious/noExplicitAny: modifiers access across TS node kinds.
	const mods = (node as any).modifiers as ts.NodeArray<ts.Modifier> | undefined;
	return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

/**
 * Parse the public export surface from a plugin's `src/index.ts`. Handles
 * re-exports (`export { x } from`, `export type { T } from`) and direct
 * declarations (`export const/function/class/type/interface/enum`). `export *`
 * cannot be enumerated statically — its presence is reported separately.
 */
function parseExportSurface(indexPath: string): {
	entries: ExportEntry[];
	hasStar: boolean;
} {
	if (!existsSync(indexPath)) return { entries: [], hasStar: false };
	const src = readFileSync(indexPath, "utf8");
	const sf = ts.createSourceFile(
		indexPath,
		src,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const found = new Map<string, boolean>(); // name → isType
	let hasStar = false;
	const add = (name: string, isType: boolean) => {
		const prev = found.get(name);
		// A value export wins over a type-only export of the same name.
		found.set(name, prev === undefined ? isType : prev && isType);
	};

	for (const stmt of sf.statements) {
		if (ts.isExportDeclaration(stmt)) {
			if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
				for (const el of stmt.exportClause.elements) {
					add(el.name.text, Boolean(stmt.isTypeOnly || el.isTypeOnly));
				}
			} else if (!stmt.exportClause) {
				hasStar = true; // `export * from "..."`
			}
			continue;
		}
		if (!hasExportModifier(stmt)) continue;
		if (ts.isFunctionDeclaration(stmt) && stmt.name) add(stmt.name.text, false);
		else if (ts.isClassDeclaration(stmt) && stmt.name)
			add(stmt.name.text, false);
		else if (ts.isVariableStatement(stmt)) {
			for (const d of stmt.declarationList.declarations)
				if (ts.isIdentifier(d.name)) add(d.name.text, false);
		} else if (ts.isEnumDeclaration(stmt)) add(stmt.name.text, false);
		else if (ts.isTypeAliasDeclaration(stmt)) add(stmt.name.text, true);
		else if (ts.isInterfaceDeclaration(stmt)) add(stmt.name.text, true);
	}

	const entries = [...found.entries()]
		.map(([name, isType]) => ({
			name,
			kind: isType ? ("type" as const) : classifyValue(name),
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
	return { entries, hasStar };
}

function repoUrl(pkg: {
	repository?: string | { url?: string };
}): string | undefined {
	const raw = pkg.repository;
	if (!raw) return undefined;
	const url = typeof raw === "string" ? raw : raw.url;
	if (!url) return undefined;
	return url.replace(/^git\+/, "").replace(/\.git$/, "");
}

function readLocalizedReadme(pluginDir: string): Record<Locale, string> {
	const base = join(pluginDir, "README.md");
	const fallback = existsSync(base) ? readFileSync(base, "utf8") : "";
	const out = {} as Record<Locale, string>;
	for (const lang of LOCALES) {
		if (lang === "") {
			out[lang] = fallback;
			continue;
		}
		const localized = join(pluginDir, `README.${lang}.md`);
		out[lang] = existsSync(localized)
			? readFileSync(localized, "utf8")
			: fallback;
	}
	return out;
}

function titleFromSlug(slug: string): string {
	return slug
		.replace(/^plugin-/, "")
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

function parsePlugin(slug: string): PluginInfo {
	const pluginDir = join(PLUGINS_ROOT, slug);
	const pkgPath = join(pluginDir, "package.json");
	if (!existsSync(pkgPath)) fail(slug, `missing ${pkgPath}`);

	const pkg = readJson<{
		name: string;
		version: string;
		description?: string;
		peerDependencies?: Record<string, string>;
		peerDependenciesMeta?: Record<string, { optional?: boolean }>;
		dependencies?: Record<string, string>;
		exports?: Record<string, unknown>;
		repository?: string | { url?: string };
	}>(pkgPath);

	const metaPath = join(pluginDir, "meta", "config.json");
	const meta: PluginMeta = existsSync(metaPath)
		? readJson<PluginMeta>(metaPath)
		: {};

	const capability: CapabilityKey = meta.capabilities?.sidebar
		? "sidebar"
		: meta.capabilities?.header
			? "header"
			: "headless";

	const peerDeps: PeerDep[] = Object.entries(pkg.peerDependencies ?? {})
		.map(([name, range]) => ({
			name,
			range: range === "workspace:*" ? "latest" : range,
			optional: pkg.peerDependenciesMeta?.[name]?.optional === true,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));

	const anvilkitDeps = Object.keys(pkg.dependencies ?? {})
		.filter((d) => d.startsWith("@anvilkit/"))
		.sort();

	const subpaths: Subpath[] = Object.keys(pkg.exports ?? {})
		.filter((key) => key !== ".")
		.map((key) => ({ path: key, wildcard: key.includes("*") }))
		.sort((a, b) => a.path.localeCompare(b.path));

	const { entries: exportEntries } = parseExportSurface(
		join(pluginDir, "src", "index.ts"),
	);

	const primaryFactory =
		exportEntries.find((e) => e.kind === "factory" && /Plugin$/.test(e.name))
			?.name ?? exportEntries.find((e) => e.kind === "factory")?.name;

	const description =
		(meta.description ?? pkg.description ?? "").trim() ||
		`Anvilkit ${titleFromSlug(slug)} plugin.`;

	return {
		slug,
		displayName: meta.name ?? titleFromSlug(slug),
		pkgName: pkg.name,
		version: pkg.version,
		description,
		category: pluginCategory(slug),
		capability,
		peerDeps,
		anvilkitDeps,
		subpaths,
		exports: exportEntries,
		primaryFactory,
		repository: repoUrl(pkg),
		readme: readLocalizedReadme(pluginDir),
	};
}

// ---------------------------------------------------------------------------
// README handling
// ---------------------------------------------------------------------------

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

/**
 * READMEs are authored as npm docs, not MDX. Strip HTML comments (invalid in
 * MDX) so the injected body never fails the strict MDX compile. Anything else
 * the components generator already tolerates, since component READMEs flow
 * through the same Fumadocs pipeline.
 */
function mdxSafe(body: string): string {
	return body.replace(/<!--[\s\S]*?-->/g, "");
}

// ---------------------------------------------------------------------------
// Locales + translated boilerplate
// ---------------------------------------------------------------------------

const LOCALES = ["", "zh", "ja", "ko"] as const;
type Locale = (typeof LOCALES)[number];

type Strings = {
	sectionTitle: string;
	sectionDesc: string;
	indexLead: string;
	indexAuthoring: string;
	colPlugin: string;
	colPackage: string;
	colCategory: string;
	colCapability: string;
	colSummary: string;
	cap: Record<CapabilityKey, string>;
	cat: Record<PluginCategory, string>;
	install: string;
	installLead: string;
	quickStart: string;
	quickStartLead: string;
	quickStartComment: string;
	peerDeps: string;
	peerLead: string;
	colRange: string;
	colOptional: string;
	yes: string;
	no: string;
	entryPoints: string;
	entryLead: string;
	colSubpath: string;
	apiRef: string;
	apiLead: string;
	apiStarNote: string;
	colExport: string;
	colKind: string;
	kind: Record<ExportKind, string>;
	guide: string;
	resources: string;
	repoLink: string;
	apiLink: string;
};

const T: Record<Locale, Strings> = {
	"": {
		sectionTitle: "Plugins",
		sectionDesc:
			"Auto-generated catalog of every @anvilkit/* Studio plugin package.",
		indexLead:
			"This catalog is regenerated from each plugin's `package.json`, `meta/config.json`,\n`README.md`, and `src/index.ts` export surface on every docs build — see\n`apps/docs/scripts/generate-plugin-pages.ts`.",
		indexAuthoring:
			"Writing your own plugin? Start with the [plugin authoring guide](/guides/plugin-authoring).",
		colPlugin: "Plugin",
		colPackage: "Package",
		colCategory: "Category",
		colCapability: "Surface",
		colSummary: "Summary",
		cap: {
			sidebar: "Sidebar panel",
			header: "Header action",
			headless: "Headless",
		},
		cat: {
			ai: "AI",
			assets: "Assets",
			export: "Export",
			history: "History",
			studio: "Studio",
		},
		install: "Installation",
		installLead: "Install the package and its peer dependencies:",
		quickStart: "Quick start",
		quickStartLead: "Register the plugin on the `<Studio>` shell:",
		quickStartComment: "options — see the guide below",
		peerDeps: "Peer dependencies",
		peerLead: "The host app must provide these versions:",
		colRange: "Range",
		colOptional: "Optional",
		yes: "yes",
		no: "no",
		entryPoints: "Entry points",
		entryLead:
			"In addition to the main entry, this package exposes these subpaths:",
		colSubpath: "Subpath",
		apiRef: "API reference",
		apiLead: "Public exports from the package entry, classified by kind.",
		apiStarNote:
			"This entry also re-exports additional members via `export *` — see the package source.",
		colExport: "Export",
		colKind: "Kind",
		kind: {
			factory: "Factory",
			hook: "Hook",
			component: "Component / class",
			util: "Function",
			constant: "Constant",
			type: "Type",
		},
		guide: "Guide",
		resources: "Resources",
		repoLink: "Source repository",
		apiLink: "Full API reference",
	},
	zh: {
		sectionTitle: "插件",
		sectionDesc: "自动生成的所有 @anvilkit/* Studio 插件包目录。",
		indexLead:
			"此目录在每次构建文档时，都会根据每个插件的 `package.json`、`meta/config.json`、\n`README.md` 和 `src/index.ts` 导出面重新生成 —— 参见\n`apps/docs/scripts/generate-plugin-pages.ts`。",
		indexAuthoring:
			"想编写自己的插件？请从 [插件编写指南](/zh/guides/plugin-authoring) 开始。",
		colPlugin: "插件",
		colPackage: "包",
		colCategory: "分类",
		colCapability: "形态",
		colSummary: "摘要",
		cap: { sidebar: "侧边栏面板", header: "顶栏操作", headless: "无界面" },
		cat: {
			ai: "AI",
			assets: "资源",
			export: "导出",
			history: "历史",
			studio: "Studio",
		},
		install: "安装",
		installLead: "安装该包及其对等依赖：",
		quickStart: "快速开始",
		quickStartLead: "在 `<Studio>` 外壳上注册该插件：",
		quickStartComment: "选项 —— 参见下方指南",
		peerDeps: "对等依赖",
		peerLead: "宿主应用必须提供以下版本：",
		colRange: "版本范围",
		colOptional: "可选",
		yes: "是",
		no: "否",
		entryPoints: "入口点",
		entryLead: "除主入口外，此包还暴露以下子路径：",
		colSubpath: "子路径",
		apiRef: "API 参考",
		apiLead: "来自包入口的公共导出，按类型分类。",
		apiStarNote: "此入口还通过 `export *` 重新导出其他成员 —— 请参见包源码。",
		colExport: "导出",
		colKind: "类型",
		kind: {
			factory: "工厂函数",
			hook: "Hook",
			component: "组件 / 类",
			util: "函数",
			constant: "常量",
			type: "类型",
		},
		guide: "指南",
		resources: "资源",
		repoLink: "源码仓库",
		apiLink: "完整 API 参考",
	},
	ja: {
		sectionTitle: "プラグイン",
		sectionDesc:
			"すべての @anvilkit/* Studio プラグインパッケージの自動生成カタログ。",
		indexLead:
			"このカタログは、ドキュメントをビルドするたびに各プラグインの `package.json`、`meta/config.json`、\n`README.md`、`src/index.ts` のエクスポート面から再生成されます —\n`apps/docs/scripts/generate-plugin-pages.ts` を参照してください。",
		indexAuthoring:
			"独自に作成しますか？[プラグイン作成ガイド](/ja/guides/plugin-authoring)から始めてください。",
		colPlugin: "プラグイン",
		colPackage: "パッケージ",
		colCategory: "カテゴリ",
		colCapability: "形態",
		colSummary: "概要",
		cap: {
			sidebar: "サイドバーパネル",
			header: "ヘッダーアクション",
			headless: "ヘッドレス",
		},
		cat: {
			ai: "AI",
			assets: "アセット",
			export: "エクスポート",
			history: "履歴",
			studio: "Studio",
		},
		install: "インストール",
		installLead: "パッケージとその peer 依存関係をインストールします：",
		quickStart: "クイックスタート",
		quickStartLead: "`<Studio>` シェルにプラグインを登録します：",
		quickStartComment: "オプション — 下記のガイドを参照",
		peerDeps: "Peer 依存関係",
		peerLead: "ホストアプリは以下のバージョンを提供する必要があります：",
		colRange: "バージョン範囲",
		colOptional: "任意",
		yes: "はい",
		no: "いいえ",
		entryPoints: "エントリポイント",
		entryLead:
			"メインエントリに加えて、このパッケージは次のサブパスを公開します：",
		colSubpath: "サブパス",
		apiRef: "API リファレンス",
		apiLead: "パッケージエントリからの公開エクスポート（種類別に分類）。",
		apiStarNote:
			"このエントリは `export *` を介して追加のメンバーも再エクスポートします — パッケージのソースを参照してください。",
		colExport: "エクスポート",
		colKind: "種類",
		kind: {
			factory: "ファクトリ",
			hook: "フック",
			component: "コンポーネント / クラス",
			util: "関数",
			constant: "定数",
			type: "型",
		},
		guide: "ガイド",
		resources: "リソース",
		repoLink: "ソースリポジトリ",
		apiLink: "完全な API リファレンス",
	},
	ko: {
		sectionTitle: "플러그인",
		sectionDesc:
			"모든 @anvilkit/* Studio 플러그인 패키지의 자동 생성 카탈로그.",
		indexLead:
			"이 카탈로그는 문서를 빌드할 때마다 각 플러그인의 `package.json`, `meta/config.json`,\n`README.md`, `src/index.ts` 익스포트 표면에서 다시 생성됩니다 —\n`apps/docs/scripts/generate-plugin-pages.ts` 참조.",
		indexAuthoring:
			"직접 작성하시나요? [플러그인 작성 가이드](/ko/guides/plugin-authoring)부터 시작하세요.",
		colPlugin: "플러그인",
		colPackage: "패키지",
		colCategory: "카테고리",
		colCapability: "형태",
		colSummary: "요약",
		cap: {
			sidebar: "사이드바 패널",
			header: "헤더 액션",
			headless: "헤드리스",
		},
		cat: {
			ai: "AI",
			assets: "에셋",
			export: "내보내기",
			history: "기록",
			studio: "Studio",
		},
		install: "설치",
		installLead: "패키지와 해당 peer 의존성을 설치합니다:",
		quickStart: "빠른 시작",
		quickStartLead: "`<Studio>` 셸에 플러그인을 등록합니다:",
		quickStartComment: "옵션 — 아래 가이드 참조",
		peerDeps: "Peer 의존성",
		peerLead: "호스트 앱은 다음 버전을 제공해야 합니다:",
		colRange: "버전 범위",
		colOptional: "선택",
		yes: "예",
		no: "아니오",
		entryPoints: "진입점",
		entryLead: "메인 진입점 외에 이 패키지는 다음 서브경로를 노출합니다:",
		colSubpath: "서브경로",
		apiRef: "API 레퍼런스",
		apiLead: "패키지 진입점의 공개 익스포트(종류별 분류).",
		apiStarNote:
			"이 진입점은 `export *`를 통해 추가 멤버도 다시 내보냅니다 — 패키지 소스를 참조하세요.",
		colExport: "익스포트",
		colKind: "종류",
		kind: {
			factory: "팩토리",
			hook: "훅",
			component: "컴포넌트 / 클래스",
			util: "함수",
			constant: "상수",
			type: "타입",
		},
		guide: "가이드",
		resources: "리소스",
		repoLink: "소스 저장소",
		apiLink: "전체 API 레퍼런스",
	},
};

// Order export-kind groups consistently across every page.
const KIND_ORDER: ExportKind[] = [
	"factory",
	"hook",
	"component",
	"util",
	"constant",
	"type",
];

function localizedDescription(lang: Locale, info: PluginInfo): string {
	switch (lang) {
		case "zh":
			return `Anvilkit ${info.displayName} 插件。`;
		case "ja":
			return `Anvilkit ${info.displayName} プラグイン。`;
		case "ko":
			return `Anvilkit ${info.displayName} 플러그인.`;
		default:
			return info.description;
	}
}

function fileName(slug: string, lang: Locale): string {
	return lang ? `${slug}.${lang}.mdx` : `${slug}.mdx`;
}

function localizePluginHref(slug: string, lang: Locale): string {
	return lang ? `/${lang}/plugins/${slug}` : `/plugins/${slug}`;
}

function localizeGuideHref(path: string, lang: Locale): string {
	return lang ? `/${lang}/${path}` : `/${path}`;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function buildPeerTable(info: PluginInfo, lang: Locale): string {
	const t = T[lang];
	const rows = [
		`| ${t.colPackage} | ${t.colRange} | ${t.colOptional} |`,
		"|---------|-------|----------|",
	];
	for (const dep of info.peerDeps) {
		rows.push(
			`| \`${dep.name}\` | \`${dep.range}\` | ${dep.optional ? t.yes : t.no} |`,
		);
	}
	return rows.join("\n");
}

function buildEntryPointsTable(info: PluginInfo, lang: Locale): string {
	const t = T[lang];
	const rows = [`| ${t.colSubpath} |`, "|---------|"];
	rows.push(`| \`${info.pkgName}\` |`);
	for (const sub of info.subpaths) {
		const display = sub.path.replace(/^\./, info.pkgName);
		rows.push(`| \`${display}\` |`);
	}
	return rows.join("\n");
}

function buildApiTable(info: PluginInfo, lang: Locale): string {
	const t = T[lang];
	const rows = [`| ${t.colExport} | ${t.colKind} |`, "|--------|------|"];
	const ordered = [...info.exports].sort((a, b) => {
		const k = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
		return k !== 0 ? k : a.name.localeCompare(b.name);
	});
	for (const e of ordered) {
		rows.push(`| \`${e.name}\` | ${t.kind[e.kind]} |`);
	}
	return rows.join("\n");
}

function buildInstallBlock(info: PluginInfo): string {
	const peers = info.peerDeps.filter((p) => !p.optional).map((p) => p.name);
	const all = [info.pkgName, ...peers];
	return `\`\`\`sh
pnpm add ${all.join(" ")}
\`\`\``;
}

function buildQuickStart(info: PluginInfo, lang: Locale): string | null {
	if (!info.primaryFactory) return null;
	const t = T[lang];
	return `\`\`\`tsx
import { ${info.primaryFactory} } from "${info.pkgName}";
import { Studio } from "@anvilkit/core";

<Studio
	puckConfig={config}
	plugins={[${info.primaryFactory}({ /* ${t.quickStartComment} */ })]}
/>;
\`\`\``;
}

function renderMdx(info: PluginInfo, lang: Locale): string {
	const t = T[lang];
	const description = localizedDescription(lang, info);
	const readmeBody = mdxSafe(stripReadmeHeading(info.readme[lang]));
	const { hasStar } = parseExportSurface(
		join(PLUGINS_ROOT, info.slug, "src", "index.ts"),
	);

	const quickStart = buildQuickStart(info, lang);
	const apiLinkHref = localizeGuideHref("api", lang);

	const sections: string[] = [];

	sections.push(
		`<div className="anvilkit-plugin-meta">\n\t<code>${info.pkgName}</code> <span>·</span> <span>v${info.version}</span> <span>·</span> <span>${t.cat[info.category]}</span> <span>·</span> <span>${t.cap[info.capability]}</span>\n</div>`,
	);

	sections.push(
		`## ${t.install}\n\n${t.installLead}\n\n${buildInstallBlock(info)}`,
	);

	if (info.peerDeps.length > 0) {
		sections.push(
			`### ${t.peerDeps}\n\n${t.peerLead}\n\n${buildPeerTable(info, lang)}`,
		);
	}

	if (quickStart) {
		sections.push(`## ${t.quickStart}\n\n${t.quickStartLead}\n\n${quickStart}`);
	}

	if (readmeBody.trim().length > 0) {
		sections.push(`## ${t.guide}\n\n${readmeBody}`);
	}

	if (info.subpaths.length > 0) {
		sections.push(
			`## ${t.entryPoints}\n\n${t.entryLead}\n\n${buildEntryPointsTable(info, lang)}`,
		);
	}

	if (info.exports.length > 0) {
		const starNote = hasStar ? `\n\n${t.apiStarNote}` : "";
		sections.push(
			`## ${t.apiRef}\n\n${t.apiLead}${starNote}\n\n${buildApiTable(info, lang)}`,
		);
	}

	const resourceLinks: string[] = [`- [${t.apiLink}](${apiLinkHref})`];
	if (info.repository) {
		resourceLinks.push(`- [${t.repoLink}](${info.repository})`);
	}
	sections.push(`## ${t.resources}\n\n${resourceLinks.join("\n")}`);

	return `---
title: ${JSON.stringify(info.displayName)}
description: ${JSON.stringify(description)}
---

${sections.join("\n\n")}
`;
}

function renderIndex(all: PluginInfo[], lang: Locale): string {
	const t = T[lang];
	const sorted = [...all].sort((a, b) => {
		const c = a.category.localeCompare(b.category);
		return c !== 0 ? c : a.displayName.localeCompare(b.displayName);
	});
	const rows = sorted
		.map((info) => {
			const href = localizePluginHref(info.slug, lang);
			const summary = localizedDescription(lang, info);
			return `| [${info.displayName}](${href}) | \`${info.pkgName}\` | ${t.cat[info.category]} | ${t.cap[info.capability]} | ${summary} |`;
		})
		.join("\n");

	return `---
title: ${JSON.stringify(t.sectionTitle)}
description: ${JSON.stringify(t.sectionDesc)}
---

${t.indexLead}

${t.indexAuthoring}

| ${t.colPlugin} | ${t.colPackage} | ${t.colCategory} | ${t.colCapability} | ${t.colSummary} |
|--------|---------|----------|---------|---------|
${rows}
`;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function clearOutDir(): void {
	if (existsSync(OUT_DIR)) {
		for (const entry of readdirSync(OUT_DIR)) {
			if (
				entry.endsWith(".mdx") ||
				entry.endsWith(".md") ||
				entry.endsWith(".json")
			) {
				rmSync(join(OUT_DIR, entry));
			}
		}
	} else {
		mkdirSync(OUT_DIR, { recursive: true });
	}
}

function writePage(info: PluginInfo): void {
	for (const lang of LOCALES) {
		writeFileSync(
			join(OUT_DIR, fileName(info.slug, lang)),
			renderMdx(info, lang),
			"utf8",
		);
	}
}

function main(): void {
	clearOutDir();
	const slugs = listPluginSlugs();
	if (slugs.length === 0) {
		console.error(
			"[generate-plugin-pages] no plugins found — are submodules initialized?",
		);
		process.exit(1);
	}

	const results: PluginInfo[] = [];
	for (const slug of slugs) {
		const info = parsePlugin(slug);
		writePage(info);
		results.push(info);
		console.log(`[generate-plugin-pages] wrote plugins/${slug}.mdx`);
	}

	for (const lang of LOCALES) {
		writeFileSync(
			join(OUT_DIR, lang ? `index.${lang}.mdx` : "index.mdx"),
			renderIndex(results, lang),
			"utf8",
		);
		writeFileSync(
			join(OUT_DIR, lang ? `meta.${lang}.json` : "meta.json"),
			`${JSON.stringify({ title: T[lang].sectionTitle, pages: ["index", "..."] }, null, "\t")}\n`,
			"utf8",
		);
	}

	console.log(
		`[generate-plugin-pages] ${results.length} plugins × ${LOCALES.length} locales + index + meta.json`,
	);
}

main();
