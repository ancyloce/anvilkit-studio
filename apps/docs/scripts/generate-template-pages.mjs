#!/usr/bin/env node
/**
 * Reads every `@anvilkit/template-*` package and emits a Fumadocs MDX page at
 * `content/docs/templates/<slug>.mdx`, plus a `templates/index.mdx` catalog and
 * a `templates/meta.json`. Copies each template's `preview.png` into
 * `public/templates/<slug>/`.
 *
 * i18n: for every page it also emits `<slug>.{zh,ja,ko}.mdx` (and localized
 * `index` + `meta` files). Generator-controlled boilerplate (headings, the
 * catalog intro, per-template name/description) is translated; the per-template
 * README body stays English (it is sourced from each package's README). Because
 * the translations live in this generator, they survive regeneration.
 *
 * Fumadocs-native port of apps/docs/scripts/generate-template-pages.mjs:
 * frontmatter is title+description only (no Starlight sidebar/editUrl), raw
 * HTML uses className + style objects, and the catalog uses Fumadocs <Cards>.
 *
 * Re-runnable; overwrites its own output. Wired via the `generate:templates`
 * script.
 */
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = join(here, "..");
const WORKSPACE_ROOT = join(DOCS_ROOT, "..", "..");
const TEMPLATES_ROOT = join(
	WORKSPACE_ROOT,
	"packages",
	"extensions",
	"templates",
);
const MDX_OUT = join(DOCS_ROOT, "content", "docs", "templates");
const PREVIEW_OUT = join(DOCS_ROOT, "public", "templates");
// Central translation store (committed in the main repo so it survives clones +
// regeneration). A `<slug>.<lang>.md` here overrides the English package README
// for that locale; otherwise the body falls back to English.
const README_STORE = join(DOCS_ROOT, "i18n", "readmes", "templates");

function localizedReadme(slug, lang, englishReadme) {
	if (!lang) return englishReadme;
	const p = join(README_STORE, `${slug}.${lang}.md`);
	return existsSync(p) ? readFileSync(p, "utf8") : englishReadme;
}

// "" is the default English locale (unsuffixed filename); the rest are prefixed
// and use a `.{lang}.mdx` suffix (Fumadocs `parser: 'dot'`).
const LOCALES = ["", "zh", "ja", "ko"];

// Generator-controlled boilerplate, per locale. English ("") is the source text.
const T = {
	"": {
		sectionTitle: "Templates",
		sectionDesc:
			"Browse the first-party Anvilkit seed templates — landing pages, blog layouts, pricing, contact, and about. Scaffold any of them with `npx anvilkit init --template <slug>`.",
		intro:
			"Each first-party seed template composes real `@anvilkit/*` component packages —\nzero placeholders — and scaffolds into a running Puck project with one CLI call:",
		scaffold: "Scaffold from the CLI",
		composition: "Composition",
		compositionLead:
			"The committed `PageIR` wires the following node types at the root:",
		packageDetails: "Package details",
	},
	zh: {
		sectionTitle: "模板",
		sectionDesc:
			"浏览 Anvilkit 官方种子模板 —— 落地页、博客布局、定价、联系与关于页。使用 `npx anvilkit init --template <slug>` 即可脚手架生成其中任意一个。",
		intro:
			"每个官方种子模板都由真实的 `@anvilkit/*` 组件包组合而成 —— 没有任何占位符 ——\n只需一次 CLI 调用即可脚手架生成一个可运行的 Puck 项目：",
		scaffold: "通过 CLI 脚手架生成",
		composition: "组成结构",
		compositionLead: "提交的 `PageIR` 在根节点连接了以下节点类型：",
		packageDetails: "包详情",
	},
	ja: {
		sectionTitle: "テンプレート",
		sectionDesc:
			"Anvilkit のファーストパーティ・シードテンプレート（ランディングページ、ブログレイアウト、料金、お問い合わせ、概要）を閲覧できます。`npx anvilkit init --template <slug>` でいずれもスキャフォールドできます。",
		intro:
			"各ファーストパーティ・シードテンプレートは、実際の `@anvilkit/*` コンポーネントパッケージで構成され（プレースホルダーは一切なし）、\n1 回の CLI コマンドで動作する Puck プロジェクトをスキャフォールドします：",
		scaffold: "CLI からスキャフォールド",
		composition: "構成",
		compositionLead:
			"コミット済みの `PageIR` は、ルートに次のノードタイプを配線します：",
		packageDetails: "パッケージの詳細",
	},
	ko: {
		sectionTitle: "템플릿",
		sectionDesc:
			"Anvilkit 퍼스트파티 시드 템플릿(랜딩 페이지, 블로그 레이아웃, 가격, 문의, 소개)을 둘러보세요. `npx anvilkit init --template <slug>`로 무엇이든 스캐폴딩할 수 있습니다.",
		intro:
			"각 퍼스트파티 시드 템플릿은 실제 `@anvilkit/*` 컴포넌트 패키지로 구성되며(플레이스홀더 없음),\n단 한 번의 CLI 호출로 실행 가능한 Puck 프로젝트를 스캐폴딩합니다:",
		scaffold: "CLI로 스캐폴딩",
		composition: "구성",
		compositionLead: "커밋된 `PageIR`는 루트에 다음 노드 타입을 연결합니다:",
		packageDetails: "패키지 세부 정보",
	},
};

// Per-template display name + description translations, keyed by slug. Falls back
// to the package's English `displayName`/`description` when a key is missing.
const TEMPLATE_I18N = {
	about: {
		zh: {
			name: "关于页面",
			desc: "关于页面 —— 主视觉、使命区块、数据统计、客户 logo 墙。",
		},
		ja: {
			name: "概要ページ",
			desc: "概要ページ — ヒーロー、ミッションセクション、統計、顧客ロゴクラウド。",
		},
		ko: {
			name: "소개 페이지",
			desc: "소개 페이지 — 히어로, 미션 섹션, 통계, 고객 로고 클라우드.",
		},
	},
	"blog-article": {
		zh: {
			name: "博客文章页面",
			desc: "博客文章页面 —— 导航栏、文章区块、相关文章 CTA。",
		},
		ja: {
			name: "ブログ記事ページ",
			desc: "ブログ記事ページ — ナビバー、記事セクション、関連記事 CTA。",
		},
		ko: {
			name: "블로그 기사 페이지",
			desc: "블로그 기사 페이지 — 내비게이션 바, 기사 섹션, 관련 글 CTA.",
		},
	},
	"blog-index": {
		zh: {
			name: "博客索引页面",
			desc: "博客索引页面 —— 导航栏、区块标题、文章列表。",
		},
		ja: {
			name: "ブログ一覧ページ",
			desc: "ブログ一覧ページ — ナビバー、セクション見出し、投稿リスト。",
		},
		ko: {
			name: "블로그 목록 페이지",
			desc: "블로그 목록 페이지 — 내비게이션 바, 섹션 제목, 게시물 목록.",
		},
	},
	canvas: {
		zh: {
			name: "AnvilKit Canvas Studio 入门设计",
			desc: "为 AnvilKit Canvas Studio 提供的 10 个 CanvasIR 入门设计（海报、社交媒体、幻灯片、印刷品）。",
		},
		ja: {
			name: "AnvilKit Canvas Studio スターターデザイン",
			desc: "AnvilKit Canvas Studio 向けの 10 個の CanvasIR スターターデザイン（ポスター、ソーシャル、スライド、印刷）。",
		},
		ko: {
			name: "AnvilKit Canvas Studio 시작 디자인",
			desc: "AnvilKit Canvas Studio를 위한 10가지 CanvasIR 시작 디자인(포스터, 소셜, 슬라이드, 인쇄).",
		},
	},
	changelog: {
		zh: {
			name: "更新日志页面",
			desc: "更新日志页面 —— 导航栏、区块标题、用于条目的 blog-list。",
		},
		ja: {
			name: "変更履歴ページ",
			desc: "変更履歴ページ — ナビバー、セクション見出し、エントリ用の blog-list。",
		},
		ko: {
			name: "변경 로그 페이지",
			desc: "변경 로그 페이지 — 내비게이션 바, 섹션 제목, 항목용 blog-list.",
		},
	},
	contact: {
		zh: {
			name: "联系页面",
			desc: "联系页面 —— 导航栏、联系区块、内联的邮箱 + 留言表单及提交按钮。",
		},
		ja: {
			name: "お問い合わせページ",
			desc: "お問い合わせページ — ナビバー、お問い合わせセクション、送信ボタン付きのインラインメール + メッセージフォーム。",
		},
		ko: {
			name: "문의 페이지",
			desc: "문의 페이지 — 내비게이션 바, 문의 섹션, 제출 버튼이 있는 인라인 이메일 + 메시지 폼.",
		},
	},
	"feature-overview": {
		zh: {
			name: "产品功能概览",
			desc: "产品功能概览 —— 主视觉、bento 功能网格、数据统计、常见问题。",
		},
		ja: {
			name: "製品機能の概要",
			desc: "製品機能の概要 — ヒーロー、bento 機能グリッド、統計、FAQ。",
		},
		ko: {
			name: "제품 기능 개요",
			desc: "제품 기능 개요 — 히어로, bento 기능 그리드, 통계, FAQ.",
		},
	},
	"landing-agency": {
		zh: {
			name: "代理公司落地页",
			desc: "代理公司落地页 —— 主视觉、服务 bento、数据统计、客户评价区块。",
		},
		ja: {
			name: "エージェンシー向けランディングページ",
			desc: "エージェンシー向けランディングページ — ヒーロー、サービス bento、統計、お客様の声セクション。",
		},
		ko: {
			name: "에이전시 랜딩 페이지",
			desc: "에이전시 랜딩 페이지 — 히어로, 서비스 bento, 통계, 추천사 섹션.",
		},
	},
	"landing-docs": {
		zh: {
			name: "开发者工具文档站落地页",
			desc: "开发者工具文档站落地页 —— 主视觉、功能网格、常见问题。",
		},
		ja: {
			name: "開発者ツールのドキュメントサイト向けランディングページ",
			desc: "開発者ツールのドキュメントサイト向けランディングページ — ヒーロー、機能グリッド、FAQ。",
		},
		ko: {
			name: "개발자 도구 문서 사이트 랜딩 페이지",
			desc: "개발자 도구 문서 사이트 랜딩 페이지 — 히어로, 기능 그리드, FAQ.",
		},
	},
	"landing-saas": {
		zh: {
			name: "SaaS 产品落地页",
			desc: "SaaS 产品落地页 —— 主视觉、logo 墙、bento 功能、定价、常见问题。",
		},
		ja: {
			name: "SaaS 製品向けランディングページ",
			desc: "SaaS 製品向けランディングページ — ヒーロー、ロゴクラウド、bento 機能、料金、FAQ。",
		},
		ko: {
			name: "SaaS 제품 랜딩 페이지",
			desc: "SaaS 제품 랜딩 페이지 — 히어로, 로고 클라우드, bento 기능, 가격, FAQ.",
		},
	},
	"pricing-comparison": {
		zh: {
			name: "独立定价页面",
			desc: "独立定价页面 —— 主视觉横幅、定价档位、对比常见问题。",
		},
		ja: {
			name: "独立した料金ページ",
			desc: "独立した料金ページ — ヒーローバナー、料金プラン、比較 FAQ。",
		},
		ko: {
			name: "독립형 가격 페이지",
			desc: "독립형 가격 페이지 — 히어로 배너, 가격 등급, 비교 FAQ.",
		},
	},
};

// Locale-prefix an internal doc href (default locale unchanged; non-doc app
// routes like /playground stay unprefixed).
function localizeHref(href, lang) {
	if (!lang || !href.startsWith("/") || href.startsWith("/playground"))
		return href;
	return `/${lang}${href}`;
}

function fileName(slug, lang) {
	return lang ? `${slug}.${lang}.mdx` : `${slug}.mdx`;
}

function readManifest(slug) {
	const pkg = JSON.parse(
		readFileSync(join(TEMPLATES_ROOT, slug, "package.json"), "utf8"),
	);
	let readme = "";
	const readmePath = join(TEMPLATES_ROOT, slug, "README.md");
	if (existsSync(readmePath)) readme = readFileSync(readmePath, "utf8");
	let pageIR = null;
	const irPath = join(TEMPLATES_ROOT, slug, "src", "page-ir.json");
	if (existsSync(irPath)) pageIR = JSON.parse(readFileSync(irPath, "utf8"));
	return { pkg, readme, pageIR };
}

function localizedNameDesc(slug, pkg, lang) {
	const englishName = pkg.description.split("—")[0]?.trim() || slug;
	if (!lang) return { displayName: englishName, description: pkg.description };
	const entry = TEMPLATE_I18N[slug]?.[lang];
	return {
		displayName: entry?.name ?? englishName,
		description: entry?.desc ?? pkg.description,
	};
}

function mdxForTemplate({ slug, pkg, readme, pageIR }, lang) {
	const t = T[lang];
	const { displayName, description } = localizedNameDesc(slug, pkg, lang);
	const nodeTypes = (pageIR?.root?.children ?? [])
		.map((n) => n.type)
		.filter((t, i, a) => a.indexOf(t) === i);
	const readmeBody = localizedReadme(slug, lang, readme)
		.replace(/^#\s.*\n+/m, "")
		.replace(/!\[[^\]]*\]\(\.\/preview\.png\)\n*/g, "")
		.trim();

	return `---
title: ${JSON.stringify(displayName)}
description: ${JSON.stringify(description)}
---

![${displayName} preview](/templates/${slug}/preview.png)

<div className="anvilkit-template-meta">
\t<code>${pkg.name}</code> <span>·</span> <span>v${pkg.version}</span>
</div>

## ${t.scaffold}

\`\`\`sh
npx anvilkit init --template ${slug} my-site
\`\`\`

## ${t.composition}

${t.compositionLead}

${nodeTypes.map((type) => `- \`${type}\``).join("\n")}

## ${t.packageDetails}

${readmeBody}
`;
}

function indexMdx(templates, lang) {
	const t = T[lang];
	const cards = templates
		.map(({ slug, i18n }) => {
			const name = i18n[lang]?.displayName ?? i18n[""].displayName;
			const desc = i18n[lang]?.description ?? i18n[""].description;
			const href = localizeHref(`/templates/${slug}`, lang);
			return `\t<Card title={${JSON.stringify(name)}} href="${href}">\n\t\t${desc}\n\n\t\t<img src="/templates/${slug}/preview.png" alt="${name} preview" loading="lazy" style={{ width: "100%", height: "auto", borderRadius: ".5rem", marginTop: ".75rem" }} />\n\t</Card>`;
		})
		.join("\n");

	return `---
title: ${JSON.stringify(t.sectionTitle)}
description: ${JSON.stringify(t.sectionDesc)}
---

${t.intro}

\`\`\`sh
npx anvilkit init --template <slug> my-site
\`\`\`

<Cards>
${cards}
</Cards>
`;
}

function main() {
	if (existsSync(MDX_OUT)) rmSync(MDX_OUT, { recursive: true, force: true });
	mkdirSync(MDX_OUT, { recursive: true });
	mkdirSync(PREVIEW_OUT, { recursive: true });

	const slugs = readdirSync(TEMPLATES_ROOT, { withFileTypes: true })
		.filter(
			(d) =>
				d.isDirectory() &&
				!d.name.startsWith(".") &&
				d.name !== "scripts" &&
				d.name !== "node_modules",
		)
		.map((d) => d.name)
		.sort();

	const templates = [];
	for (const slug of slugs) {
		const { pkg, readme, pageIR } = readManifest(slug);
		// Precompute name/description for every locale for the catalog cards.
		const i18n = {};
		for (const lang of LOCALES) i18n[lang] = localizedNameDesc(slug, pkg, lang);
		templates.push({ slug, i18n });

		for (const lang of LOCALES) {
			writeFileSync(
				join(MDX_OUT, fileName(slug, lang)),
				mdxForTemplate({ slug, pkg, readme, pageIR }, lang),
			);
		}

		const previewSrc = join(TEMPLATES_ROOT, slug, "preview.png");
		if (existsSync(previewSrc)) {
			mkdirSync(join(PREVIEW_OUT, slug), { recursive: true });
			copyFileSync(previewSrc, join(PREVIEW_OUT, slug, "preview.png"));
		}
	}

	for (const lang of LOCALES) {
		writeFileSync(
			join(MDX_OUT, lang ? `index.${lang}.mdx` : "index.mdx"),
			indexMdx(templates, lang),
		);
		writeFileSync(
			join(MDX_OUT, lang ? `meta.${lang}.json` : "meta.json"),
			`${JSON.stringify({ title: T[lang].sectionTitle, pages: ["index", "..."] }, null, "\t")}\n`,
		);
	}

	console.log(
		`wrote ${templates.length} templates × ${LOCALES.length} locales + index + meta.json`,
	);
}

main();
