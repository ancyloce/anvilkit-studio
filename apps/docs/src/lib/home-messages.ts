import { i18n } from "./i18n";

// Localized copy for the marketing home page. Package names (`@anvilkit/*`) and
// the per-component / per-plugin card blurbs stay in English — they are
// identifiers and API descriptions, not prose (same rule the docs follow). Only
// section prose (eyebrows, headings, ledes, CTAs, feature copy) is translated.
export interface HomeMessages {
	// Hero
	badgeBefore: string;
	badgeAfter: string;
	heroEyebrow: string;
	heroTitleLead: string;
	heroTitleAccent: string;
	tagline: string;
	quickstart: string;
	openPlayground: string;
	viewGithub: string;
	statComponents: string;
	statPlugins: string;
	statTyped: string;
	frameTitle: string;

	// Components
	componentsEyebrow: string;
	componentsHeading: string;
	componentsBody: string;
	browseComponents: string;
	viewDocs: string;

	// Plugins
	pluginsEyebrow: string;
	pluginsHeading: string;
	pluginsBody: string;

	// Features
	featuresEyebrow: string;
	featuresHeading: string;
	featuresBody: string;
	featPackagesTitle: string;
	featPackagesBody: string;
	featIrTitle: string;
	featIrBody: string;
	featAiTitle: string;
	featAiBody: string;
	featExportTitle: string;
	featExportBody: string;
	featCollabTitle: string;
	featCollabBody: string;
	featHistoryTitle: string;
	featHistoryBody: string;

	// Feature layers (Liquid Glass cards)
	layerCoreTitle: string;
	layerCoreBody: string;
	layerLiveTitle: string;
	layerLiveBody: string;
	browsePlugins: string;

	// Install
	installEyebrow: string;
	installHeading: string;
	installBody: string;
	collabBefore: string;
	collabLink: string;
	collabAfter: string;

	// Finale
	finaleHeading: string;
	finaleBody: string;
	finalePrimary: string;
	finaleSecondary: string;
}

const en: HomeMessages = {
	badgeBefore: "In active development —",
	badgeAfter: "line, publishing independently",
	heroEyebrow: "Puck-native component kit",
	heroTitleLead: "Ship Puck pages",
	heroTitleAccent: "at the speed of thought",
	tagline:
		"A headless page builder, broken into pieces you actually install. Components, a typed runtime, AI, export, and realtime collab — each its own package.",
	quickstart: "Get started",
	openPlayground: "Open playground",
	viewGithub: "Star on GitHub",
	statComponents: "Components",
	statPlugins: "Plugins",
	statTyped: "Typed",
	frameTitle: "anvilkit · studio",

	componentsEyebrow: "Components",
	componentsHeading: "Drop-in building blocks",
	componentsBody:
		"Every component ships as its own npm package under @anvilkit/*. Install one, or all of them — there is no umbrella bundle and nothing you don't use.",
	browseComponents: "Browse all components",
	viewDocs: "View docs",

	pluginsEyebrow: "Plugins",
	pluginsHeading: "Extend the Studio runtime",
	pluginsBody:
		"AI, export, assets, collaboration, canvas, and design-system plugins snap into <Studio> through a single, typed registration API.",

	featuresEyebrow: "Why AnvilKit",
	featuresHeading: "Composable by design",
	featuresBody:
		"The whole kit is built around a headless intermediate representation, so every layer — render, validate, export, collaborate — speaks the same schema.",
	featPackagesTitle: "Independent packages",
	featPackagesBody:
		"Each package versions on its own via Changesets. No monolith, no dead weight, tree-shakeable to the byte.",
	featIrTitle: "Headless Page IR",
	featIrBody:
		"A typed intermediate representation powers transforms, validation, and AI-friendly schema derivation across renderers.",
	featAiTitle: "AI Copilot",
	featAiBody:
		"Generate and edit sections in natural language. The copilot speaks the same schema your components do.",
	featExportTitle: "Export anywhere",
	featExportBody:
		"One click to clean HTML or a React tree. Canvas, PDF, and image exports ship as drop-in plugins.",
	featCollabTitle: "Realtime collaboration",
	featCollabBody:
		"Yjs-backed multiplayer editing with live cursors and presence — opt in with a single plugin.",
	featHistoryTitle: "Version history",
	featHistoryBody:
		"Time-travel through every edit with branch-safe snapshots and one-click restore.",

	layerCoreTitle: "Composable foundation",
	layerCoreBody:
		"A typed core, a headless IR, and export targets that all speak the same schema.",
	layerLiveTitle: "Intelligent & live",
	layerLiveBody:
		"Generate with AI, co-edit in realtime, and travel back through every revision.",
	browsePlugins: "Browse all plugins",

	installEyebrow: "Install",
	installHeading: "Add only what you need",
	installBody:
		"The runtime core and every plugin publish as their own npm packages, versioned independently via Changesets — there is no umbrella bundle.",
	collabBefore:
		"Realtime collaboration ships on a pre-release (next) dist-tag — read the",
	collabLink: "Collaboration guide",
	collabAfter: "before installing.",

	finaleHeading: "Build your first page in minutes",
	finaleBody:
		"Scaffold a Studio, drop in components, and export production-ready markup — no lock-in, no umbrella dependency.",
	finalePrimary: "Read the quickstart",
	finaleSecondary: "Try the playground",
};

const zh: HomeMessages = {
	badgeBefore: "正在积极开发中 —",
	badgeAfter: "版本线，各包独立发布",
	heroEyebrow: "Puck 原生组件套件",
	heroTitleLead: "构建 Puck 页面",
	heroTitleAccent: "如思考般迅捷",
	tagline:
		"一个无头页面构建器，被拆分为你真正会安装的部件。组件、类型化运行时、AI、导出与实时协作 —— 各自独立成包。",
	quickstart: "开始使用",
	openPlayground: "打开演练场",
	viewGithub: "在 GitHub 加星",
	statComponents: "组件",
	statPlugins: "插件",
	statTyped: "类型化",
	frameTitle: "anvilkit · studio",

	componentsEyebrow: "组件",
	componentsHeading: "即插即用的构建块",
	componentsBody:
		"每个组件都作为独立的 npm 包发布于 @anvilkit/* 下。可只装一个，也可全部安装 —— 没有统一捆绑包，绝不夹带你用不到的东西。",
	browseComponents: "浏览全部组件",
	viewDocs: "查看文档",

	pluginsEyebrow: "插件",
	pluginsHeading: "扩展 Studio 运行时",
	pluginsBody:
		"AI、导出、资源、协作、画布与设计系统插件，通过单一且类型化的注册 API 接入 <Studio>。",

	featuresEyebrow: "为何选择 AnvilKit",
	featuresHeading: "为组合而生",
	featuresBody:
		"整套工具围绕一个无头中间表示构建，因此每一层 —— 渲染、校验、导出、协作 —— 都使用同一套 schema。",
	featPackagesTitle: "独立的软件包",
	featPackagesBody:
		"每个包通过 Changesets 独立管理版本。没有巨石架构，没有冗余负担，可精确到字节地按需打包。",
	featIrTitle: "无头页面 IR",
	featIrBody:
		"类型化的中间表示驱动跨渲染器的转换、校验与对 AI 友好的 schema 推导。",
	featAiTitle: "AI 副驾",
	featAiBody:
		"用自然语言生成与编辑区块。副驾使用的正是你组件所用的同一套 schema。",
	featExportTitle: "随处导出",
	featExportBody:
		"一键导出为干净的 HTML 或 React 树。画布、PDF 与图片导出皆为即插即用插件。",
	featCollabTitle: "实时协作",
	featCollabBody:
		"基于 Yjs 的多人协同编辑，带有实时光标与在线状态 —— 装一个插件即可启用。",
	featHistoryTitle: "版本历史",
	featHistoryBody: "借助分支安全的快照穿梭于每一次编辑，并可一键恢复。",

	layerCoreTitle: "可组合的基石",
	layerCoreBody: "类型化内核、无头 IR 与各类导出目标，全部使用同一套 schema。",
	layerLiveTitle: "智能且实时",
	layerLiveBody: "用 AI 生成、实时协同编辑，并可回溯每一次修订。",
	browsePlugins: "浏览全部插件",

	installEyebrow: "安装",
	installHeading: "只装你需要的",
	installBody:
		"运行时核心与每个插件都作为独立的 npm 包发布，通过 Changesets 单独管理版本 —— 没有统一的捆绑包。",
	collabBefore: "实时协作通过预发布（next）dist-tag 提供 —— 安装前请阅读",
	collabLink: "协作指南",
	collabAfter: "。",

	finaleHeading: "几分钟内构建你的第一个页面",
	finaleBody:
		"搭建一个 Studio，放入组件，导出可用于生产的标记 —— 无锁定，无统一依赖。",
	finalePrimary: "阅读快速上手",
	finaleSecondary: "试用演练场",
};

const ja: HomeMessages = {
	badgeBefore: "活発に開発中 —",
	badgeAfter: "ライン、各パッケージは独立して公開",
	heroEyebrow: "Puck ネイティブなコンポーネントキット",
	heroTitleLead: "Puck ページを",
	heroTitleAccent: "思考の速さで構築",
	tagline:
		"ヘッドレスなページビルダーを、実際にインストールする部品へと分割。コンポーネント、型付きランタイム、AI、エクスポート、リアルタイム協調 —— それぞれが独立したパッケージです。",
	quickstart: "はじめる",
	openPlayground: "プレイグラウンドを開く",
	viewGithub: "GitHub でスター",
	statComponents: "コンポーネント",
	statPlugins: "プラグイン",
	statTyped: "型付き",
	frameTitle: "anvilkit · studio",

	componentsEyebrow: "コンポーネント",
	componentsHeading: "そのまま使える構成部品",
	componentsBody:
		"各コンポーネントは @anvilkit/* 配下の独立した npm パッケージとして公開されます。1 つだけでも全部でも —— 一括バンドルはなく、使わないものは含まれません。",
	browseComponents: "すべてのコンポーネントを見る",
	viewDocs: "ドキュメントを見る",

	pluginsEyebrow: "プラグイン",
	pluginsHeading: "Studio ランタイムを拡張",
	pluginsBody:
		"AI、エクスポート、アセット、協調、キャンバス、デザインシステムの各プラグインが、単一で型付きの登録 API を通じて <Studio> に組み込まれます。",

	featuresEyebrow: "AnvilKit を選ぶ理由",
	featuresHeading: "組み合わせを前提に設計",
	featuresBody:
		"キット全体がヘッドレスな中間表現を中心に構築されており、レンダリング・検証・エクスポート・協調のすべての層が同じ schema を共有します。",
	featPackagesTitle: "独立したパッケージ",
	featPackagesBody:
		"各パッケージは Changesets で個別にバージョン管理。モノリスも無駄もなく、バイト単位でツリーシェイク可能です。",
	featIrTitle: "ヘッドレス Page IR",
	featIrBody:
		"型付きの中間表現が、レンダラーをまたぐ変換・検証・AI フレンドリーな schema 導出を支えます。",
	featAiTitle: "AI コパイロット",
	featAiBody:
		"自然言語でセクションを生成・編集。コパイロットはコンポーネントと同じ schema を解します。",
	featExportTitle: "どこへでもエクスポート",
	featExportBody:
		"ワンクリックでクリーンな HTML や React ツリーへ。キャンバス・PDF・画像エクスポートは差し込み式プラグインです。",
	featCollabTitle: "リアルタイム協調",
	featCollabBody:
		"Yjs ベースのマルチプレイヤー編集。ライブカーソルとプレゼンス付き —— プラグイン 1 つで有効化できます。",
	featHistoryTitle: "バージョン履歴",
	featHistoryBody:
		"ブランチセーフなスナップショットであらゆる編集を遡り、ワンクリックで復元できます。",

	layerCoreTitle: "組み合わせ可能な基盤",
	layerCoreBody:
		"型付きコア、ヘッドレス IR、各種エクスポート先 —— すべてが同じ schema を共有します。",
	layerLiveTitle: "知的でリアルタイム",
	layerLiveBody:
		"AI で生成し、リアルタイムで共同編集し、あらゆるリビジョンを遡れます。",
	browsePlugins: "すべてのプラグインを見る",

	installEyebrow: "インストール",
	installHeading: "必要なものだけを追加",
	installBody:
		"ランタイムコアとすべてのプラグインは、それぞれ独立した npm パッケージとして公開され、Changesets で個別にバージョン管理されます —— 一括バンドルはありません。",
	collabBefore:
		"リアルタイムコラボレーションはプレリリース（next）dist-tag で提供されます —— インストール前に",
	collabLink: "コラボレーションガイド",
	collabAfter: "をお読みください。",

	finaleHeading: "最初のページを数分で構築",
	finaleBody:
		"Studio を立ち上げ、コンポーネントを置き、本番向けのマークアップを出力 —— ロックインも一括依存もありません。",
	finalePrimary: "クイックスタートを読む",
	finaleSecondary: "プレイグラウンドを試す",
};

const ko: HomeMessages = {
	badgeBefore: "활발히 개발 중 —",
	badgeAfter: "라인, 각 패키지는 독립적으로 배포",
	heroEyebrow: "Puck 네이티브 컴포넌트 키트",
	heroTitleLead: "Puck 페이지를",
	heroTitleAccent: "생각하는 속도로",
	tagline:
		"헤드리스 페이지 빌더를 실제로 설치하는 조각들로 분리했습니다. 컴포넌트, 타입 지정 런타임, AI, 내보내기, 실시간 협업 —— 각각이 독립된 패키지입니다.",
	quickstart: "시작하기",
	openPlayground: "플레이그라운드 열기",
	viewGithub: "GitHub에서 스타",
	statComponents: "컴포넌트",
	statPlugins: "플러그인",
	statTyped: "타입 지정",
	frameTitle: "anvilkit · studio",

	componentsEyebrow: "컴포넌트",
	componentsHeading: "바로 쓰는 빌딩 블록",
	componentsBody:
		"모든 컴포넌트는 @anvilkit/* 아래 독립된 npm 패키지로 배포됩니다. 하나만 또는 전부 —— 통합 번들이 없고, 쓰지 않는 것은 포함되지 않습니다.",
	browseComponents: "모든 컴포넌트 보기",
	viewDocs: "문서 보기",

	pluginsEyebrow: "플러그인",
	pluginsHeading: "Studio 런타임 확장",
	pluginsBody:
		"AI, 내보내기, 자산, 협업, 캔버스, 디자인 시스템 플러그인이 단일하고 타입이 지정된 등록 API를 통해 <Studio>에 연결됩니다.",

	featuresEyebrow: "왜 AnvilKit인가",
	featuresHeading: "조합을 위한 설계",
	featuresBody:
		"키트 전체가 헤드리스 중간 표현을 중심으로 설계되어, 렌더링·검증·내보내기·협업의 모든 계층이 동일한 schema를 사용합니다.",
	featPackagesTitle: "독립된 패키지",
	featPackagesBody:
		"각 패키지는 Changesets로 개별 버전 관리됩니다. 모놀리스도 군더더기도 없이 바이트 단위로 트리 셰이킹됩니다.",
	featIrTitle: "헤드리스 Page IR",
	featIrBody:
		"타입이 지정된 중간 표현이 렌더러 전반의 변환·검증·AI 친화적 schema 도출을 구동합니다.",
	featAiTitle: "AI 코파일럿",
	featAiBody:
		"자연어로 섹션을 생성하고 편집하세요. 코파일럿은 컴포넌트와 동일한 schema를 이해합니다.",
	featExportTitle: "어디로든 내보내기",
	featExportBody:
		"클릭 한 번으로 깔끔한 HTML 또는 React 트리로. 캔버스·PDF·이미지 내보내기는 끼워 넣는 플러그인입니다.",
	featCollabTitle: "실시간 협업",
	featCollabBody:
		"Yjs 기반 멀티플레이어 편집, 실시간 커서와 프레즌스 제공 —— 플러그인 하나로 활성화합니다.",
	featHistoryTitle: "버전 기록",
	featHistoryBody:
		"브랜치 안전 스냅샷으로 모든 편집을 거슬러 올라가고 클릭 한 번으로 복원하세요.",

	layerCoreTitle: "조합 가능한 기반",
	layerCoreBody:
		"타입 지정 코어, 헤드리스 IR, 다양한 내보내기 대상이 모두 동일한 schema를 사용합니다.",
	layerLiveTitle: "지능적이고 실시간",
	layerLiveBody:
		"AI로 생성하고 실시간으로 공동 편집하며 모든 리비전을 거슬러 올라가세요.",
	browsePlugins: "모든 플러그인 보기",

	installEyebrow: "설치",
	installHeading: "필요한 것만 추가",
	installBody:
		"런타임 코어와 모든 플러그인은 각각 독립된 npm 패키지로 배포되며 Changesets로 개별 버전 관리됩니다 —— 통합 번들은 없습니다.",
	collabBefore:
		"실시간 협업은 사전 배포(next) dist-tag로 제공됩니다 —— 설치 전에",
	collabLink: "협업 가이드",
	collabAfter: "를 읽어보세요.",

	finaleHeading: "몇 분 만에 첫 페이지를 만드세요",
	finaleBody:
		"Studio를 스캐폴딩하고 컴포넌트를 넣고 프로덕션용 마크업을 내보내세요 —— 종속도, 통합 의존성도 없습니다.",
	finalePrimary: "퀵스타트 읽기",
	finaleSecondary: "플레이그라운드 사용해 보기",
};

const HOME_MESSAGES: Record<string, HomeMessages> = { en, zh, ja, ko };

export function getHomeMessages(locale: string): HomeMessages {
	return HOME_MESSAGES[locale] ?? HOME_MESSAGES[i18n.defaultLanguage];
}
