// Catalog data backing the marketing home page's Components and Plugins
// sections. Package names and blurbs are identifiers / API descriptions, not
// prose — they stay in English (see `home-messages.ts`).

export const COMPONENTS: Array<{ slug: string; pkg: string; blurb: string }> = [
	{
		slug: "bento-grid",
		pkg: "@anvilkit/bento-grid",
		blurb: "Responsive bento-style grid layout.",
	},
	{
		slug: "blockquote",
		pkg: "@anvilkit/blockquote",
		blurb: "Semantic quotations with optional citations.",
	},
	{
		slug: "blog-list",
		pkg: "@anvilkit/blog-list",
		blurb: "Paginated blog post list.",
	},
	{
		slug: "button",
		pkg: "@anvilkit/button",
		blurb: "Primary, secondary, and ghost variants.",
	},
	{
		slug: "code",
		pkg: "@anvilkit/code",
		blurb: "Escaped code blocks with optional line numbers.",
	},
	{
		slug: "columns",
		pkg: "@anvilkit/columns",
		blurb: "Responsive multi-column slot layout.",
	},
	{
		slug: "container",
		pkg: "@anvilkit/container",
		blurb: "Bounded content container with a Puck slot.",
	},
	{
		slug: "grid",
		pkg: "@anvilkit/grid",
		blurb: "Responsive grid layout with a Puck slot.",
	},
	{
		slug: "heading",
		pkg: "@anvilkit/heading",
		blurb: "Semantic heading levels and visual sizes.",
	},
	{ slug: "helps", pkg: "@anvilkit/helps", blurb: "Help / FAQ accordion." },
	{
		slug: "hero",
		pkg: "@anvilkit/hero",
		blurb: "Configurable hero section with CTAs.",
	},
	{
		slug: "icon",
		pkg: "@anvilkit/icon",
		blurb: "Accessible dependency-free interface glyphs.",
	},
	{
		slug: "image",
		pkg: "@anvilkit/image",
		blurb: "Responsive images with captions and asset references.",
	},
	{
		slug: "input",
		pkg: "@anvilkit/input",
		blurb: "Text input with label and validation.",
	},
	{
		slug: "link",
		pkg: "@anvilkit/link",
		blurb: "Editor-safe links with semantic styles.",
	},
	{
		slug: "list",
		pkg: "@anvilkit/list",
		blurb: "Ordered and unordered repeatable lists.",
	},
	{
		slug: "logo-clouds",
		pkg: "@anvilkit/logo-clouds",
		blurb: "Customer / partner logo cloud.",
	},
	{
		slug: "navbar",
		pkg: "@anvilkit/navbar",
		blurb: "Responsive top navigation bar.",
	},
	{
		slug: "pricing-minimal",
		pkg: "@anvilkit/pricing-minimal",
		blurb: "Minimal three-tier pricing table.",
	},
	{
		slug: "rich-text",
		pkg: "@anvilkit/rich-text",
		blurb: "Puck-native structured rich text.",
	},
	{
		slug: "section",
		pkg: "@anvilkit/section",
		blurb: "Generic content section wrapper.",
	},
	{
		slug: "spacer",
		pkg: "@anvilkit/spacer",
		blurb: "Responsive vertical rhythm control.",
	},
	{
		slug: "stack",
		pkg: "@anvilkit/stack",
		blurb: "Flexible row or column slot layout.",
	},
	{
		slug: "statistics",
		pkg: "@anvilkit/statistics",
		blurb: "Metrics / stat highlight block.",
	},
	{
		slug: "text",
		pkg: "@anvilkit/text",
		blurb: "Paragraph text with semantic visual variants.",
	},
	{
		slug: "video",
		pkg: "@anvilkit/video",
		blurb: "Caption-ready responsive video playback.",
	},
];

export const PLUGINS: Array<{ slug: string; name: string; blurb: string }> = [
	{
		slug: "plugin-ai-copilot",
		name: "AI Copilot",
		blurb: "Generate and edit sections with natural language.",
	},
	{
		slug: "plugin-export-html",
		name: "Export · HTML",
		blurb: "Emit clean, framework-free HTML.",
	},
	{
		slug: "plugin-export-react",
		name: "Export · React",
		blurb: "Emit a typed React component tree.",
	},
	{
		slug: "plugin-asset-manager",
		name: "Asset Manager",
		blurb: "Folders, uploads, and Unsplash search.",
	},
	{
		slug: "plugin-version-history",
		name: "Version History",
		blurb: "Branch-safe snapshots with one-click restore.",
	},
	{
		slug: "plugin-collab-yjs",
		name: "Collab · Yjs",
		blurb: "Yjs transport for realtime multiplayer editing.",
	},
	{
		slug: "plugin-collab-ui",
		name: "Collab · UI",
		blurb: "Live cursors, presence avatars, and status.",
	},
	{
		slug: "plugin-canvas-studio",
		name: "Canvas Studio",
		blurb: "A freeform design canvas inside Studio.",
	},
	{
		slug: "plugin-export-canvas",
		name: "Export · Canvas",
		blurb: "Export canvas designs to PNG, SVG, and PDF.",
	},
	{
		slug: "plugin-ai-image",
		name: "AI Image",
		blurb: "Generate and place imagery from prompts.",
	},
	{
		slug: "plugin-design-system",
		name: "Design System",
		blurb: "Tokens, themes, and a design-system rail.",
	},
	{
		slug: "plugin-page-seo",
		name: "Page SEO",
		blurb: "Metadata, Open Graph, and structured data.",
	},
];
