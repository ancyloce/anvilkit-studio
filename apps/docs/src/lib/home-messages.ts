import { i18n } from "./i18n";

// Localized copy for the marketing home page. Package names (`@anvilkit/*`) and
// the per-component blurbs stay in English — they are identifiers and API
// descriptions, not prose. Sentences that wrap inline `<code>`/`<Link>` are split
// into `…Before`/`…After` segments so the markup is interpolated at render time.
export interface HomeMessages {
	badgeBefore: string;
	badgeAfter: string;
	tagline: string;
	quickstart: string;
	openPlayground: string;
	viewGithub: string;
	installHeading: string;
	installBodyBefore: string;
	installBodyAfter: string;
	collabBefore: string;
	collabLink: string;
	collabAfter: string;
	componentsHeading: string;
	componentsBodyBefore: string;
	componentsBodyAfter: string;
	runtimeHeading: string;
	studioTitle: string;
	studioDesc: string;
	pluginTitle: string;
	pluginDesc: string;
}

const en: HomeMessages = {
	badgeBefore: "In active development — packages publish independently on the",
	badgeAfter: "line",
	tagline:
		"Ship Puck-native pages faster. Install only the components you need.",
	quickstart: "Quickstart →",
	openPlayground: "Open playground 🚀",
	viewGithub: "View on GitHub ↗",
	installHeading: "Install",
	installBodyBefore: "The runtime cone and every",
	installBodyAfter:
		"ship as their own npm packages, versioned independently via Changesets — there is no umbrella bundle. Add only what you need:",
	collabBefore:
		"Realtime collaboration ships on a pre-release (next) dist-tag — read the",
	collabLink: "Collaboration guide",
	collabAfter: "before installing.",
	componentsHeading: "Component packages",
	componentsBodyBefore: "Each component ships as its own",
	componentsBodyAfter: "npm package. Install only what you need.",
	runtimeHeading: "Runtime & plugins",
	studioTitle: "<Studio> runtime",
	studioDesc: "Host Puck inside your Next.js or React app via @anvilkit/core.",
	pluginTitle: "Plugin ecosystem",
	pluginDesc: "Extend Studio with export and AI plugins (@anvilkit/plugin-*).",
};

const zh: HomeMessages = {
	badgeBefore: "正在积极开发中 —— 各软件包独立发布于",
	badgeAfter: "版本线",
	tagline: "更快交付 Puck 原生页面，只安装你需要的组件。",
	quickstart: "快速开始 →",
	openPlayground: "打开演练场 🚀",
	viewGithub: "在 GitHub 查看 ↗",
	installHeading: "安装",
	installBodyBefore: "运行时核心与每个",
	installBodyAfter:
		"都作为独立的 npm 包发布，通过 Changesets 单独管理版本 —— 没有统一的捆绑包。按需安装即可：",
	collabBefore: "实时协作通过预发布（next）dist-tag 提供 —— 安装前请阅读",
	collabLink: "协作指南",
	collabAfter: "。",
	componentsHeading: "组件包",
	componentsBodyBefore: "每个组件都作为独立的",
	componentsBodyAfter: "npm 包发布，按需安装即可。",
	runtimeHeading: "运行时与插件",
	studioTitle: "<Studio> 运行时",
	studioDesc: "通过 @anvilkit/core 在你的 Next.js 或 React 应用中托管 Puck。",
	pluginTitle: "插件生态",
	pluginDesc: "使用导出与 AI 插件（@anvilkit/plugin-*）扩展 Studio。",
};

const ja: HomeMessages = {
	badgeBefore: "活発に開発中 — 各パッケージは独立して公開されます",
	badgeAfter: "ライン",
	tagline:
		"Puck ネイティブなページをより速く。必要なコンポーネントだけをインストール。",
	quickstart: "クイックスタート →",
	openPlayground: "プレイグラウンドを開く 🚀",
	viewGithub: "GitHub で見る ↗",
	installHeading: "インストール",
	installBodyBefore: "ランタイムコアとすべての",
	installBodyAfter:
		"は、それぞれ独立した npm パッケージとして公開され、Changesets で個別にバージョン管理されます — 一括バンドルはありません。必要なものだけを追加してください：",
	collabBefore:
		"リアルタイムコラボレーションはプレリリース（next）dist-tag で提供されます — インストール前に",
	collabLink: "コラボレーションガイド",
	collabAfter: "をお読みください。",
	componentsHeading: "コンポーネントパッケージ",
	componentsBodyBefore: "各コンポーネントは独立した",
	componentsBodyAfter:
		"npm パッケージとして公開されます。必要なものだけをインストールしてください。",
	runtimeHeading: "ランタイムとプラグイン",
	studioTitle: "<Studio> ランタイム",
	studioDesc:
		"@anvilkit/core を介して Next.js や React アプリ内で Puck をホストします。",
	pluginTitle: "プラグインエコシステム",
	pluginDesc:
		"エクスポートや AI プラグイン（@anvilkit/plugin-*）で Studio を拡張します。",
};

const ko: HomeMessages = {
	badgeBefore: "활발히 개발 중 — 각 패키지는 독립적으로 배포됩니다",
	badgeAfter: "라인",
	tagline: "Puck 네이티브 페이지를 더 빠르게. 필요한 컴포넌트만 설치하세요.",
	quickstart: "빠른 시작 →",
	openPlayground: "플레이그라운드 열기 🚀",
	viewGithub: "GitHub에서 보기 ↗",
	installHeading: "설치",
	installBodyBefore: "런타임 코어와 모든",
	installBodyAfter:
		"은(는) 각각 독립된 npm 패키지로 배포되며, Changesets로 개별 버전 관리됩니다 — 통합 번들은 없습니다. 필요한 것만 추가하세요:",
	collabBefore:
		"실시간 협업은 사전 배포(next) dist-tag로 제공됩니다 — 설치 전에",
	collabLink: "협업 가이드",
	collabAfter: "를 읽어보세요.",
	componentsHeading: "컴포넌트 패키지",
	componentsBodyBefore: "각 컴포넌트는 독립된",
	componentsBodyAfter: "npm 패키지로 배포됩니다. 필요한 것만 설치하세요.",
	runtimeHeading: "런타임 및 플러그인",
	studioTitle: "<Studio> 런타임",
	studioDesc:
		"@anvilkit/core를 통해 Next.js 또는 React 앱 안에서 Puck을 호스팅하세요.",
	pluginTitle: "플러그인 생태계",
	pluginDesc:
		"내보내기 및 AI 플러그인(@anvilkit/plugin-*)으로 Studio를 확장하세요.",
};

const HOME_MESSAGES: Record<string, HomeMessages> = { en, zh, ja, ko };

export function getHomeMessages(locale: string): HomeMessages {
	return HOME_MESSAGES[locale] ?? HOME_MESSAGES[i18n.defaultLanguage];
}
