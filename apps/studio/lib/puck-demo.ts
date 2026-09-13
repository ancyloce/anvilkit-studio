import {
	type BentoGridProps,
	defaultProps as bentoGridDefaultProps,
	createBentoGridConfig,
} from "@anvilkit/bento-grid";
import {
	type BlockquoteProps,
	createBlockquoteConfig,
} from "@anvilkit/blockquote";
import {
	type BlogListProps,
	defaultProps as blogListDefaultProps,
	createBlogListConfig,
} from "@anvilkit/blog-list";
import {
	type ButtonProps,
	defaultProps as buttonDefaultProps,
	createButtonConfig,
} from "@anvilkit/button";
import { type CodeProps, createCodeConfig } from "@anvilkit/code";
import { type ColumnsProps, createColumnsConfig } from "@anvilkit/columns";
import {
	type ContainerProps,
	createContainerConfig,
} from "@anvilkit/container";
import type {
	StudioPlugin,
	StudioPluginMeta,
	StudioSidebarUnregister,
} from "@anvilkit/core";
import { withBindingResolution } from "@anvilkit/core/editor";
import {
	createDesignBlockConfig,
	type DesignBlockProps,
} from "@anvilkit/design-block";
import { createGridConfig, type GridProps } from "@anvilkit/grid";
import { createHeadingConfig, type HeadingProps } from "@anvilkit/heading";
import {
	createHelpsConfig,
	type HelpsProps,
	defaultProps as helpsDefaultProps,
} from "@anvilkit/helps";
import {
	createHeroConfig,
	type HeroProps,
	defaultProps as heroDefaultProps,
} from "@anvilkit/hero";
import { createIconConfig, type IconProps } from "@anvilkit/icon";
import { createImageConfig, type ImageProps } from "@anvilkit/image";
import {
	createInputConfig,
	type InputProps,
	defaultProps as inputDefaultProps,
} from "@anvilkit/input";
import { createLinkConfig, type LinkProps } from "@anvilkit/link";
import { createListConfig, type ListProps } from "@anvilkit/list";
import {
	createLogoCloudsConfig,
	type LogoCloudsProps,
	defaultProps as logoCloudsDefaultProps,
} from "@anvilkit/logo-clouds";
import {
	createNavbarConfig,
	type NavbarProps,
	defaultProps as navbarDefaultProps,
} from "@anvilkit/navbar";
import {
	createPricingMinimalConfig,
	type PricingMinimalProps,
	defaultProps as pricingMinimalDefaultProps,
} from "@anvilkit/pricing-minimal";
import { createRichTextConfig, type RichTextProps } from "@anvilkit/rich-text";
import type { PageRootProps } from "@anvilkit/schema";
import {
	createSectionConfig,
	type SectionProps,
	defaultProps as sectionDefaultProps,
} from "@anvilkit/section";
import { createSpacerConfig, type SpacerProps } from "@anvilkit/spacer";
import { createStackConfig, type StackProps } from "@anvilkit/stack";
import {
	createStatisticsConfig,
	type StatisticsProps,
	defaultProps as statisticsDefaultProps,
} from "@anvilkit/statistics";
import { createTextConfig, type TextProps } from "@anvilkit/text";
import { createVideoConfig, type VideoProps } from "@anvilkit/video";
import type { Config, Data, Fields } from "@puckeditor/core";
import { createElement, Fragment } from "react";

import { demoCopySnippetPack } from "./demo-copy-snippet-pack";

export type DemoComponents = {
	BentoGrid: BentoGridProps;
	BlogList: BlogListProps;
	Blockquote: BlockquoteProps;
	Button: ButtonProps;
	Code: CodeProps;
	Columns: ColumnsProps;
	Container: ContainerProps;
	DesignBlock: DesignBlockProps;
	Grid: GridProps;
	Heading: HeadingProps;
	Hero: HeroProps;
	Helps: HelpsProps;
	Icon: IconProps;
	Image: ImageProps;
	Input: InputProps;
	Link: LinkProps;
	List: ListProps;
	LogoClouds: LogoCloudsProps;
	Navbar: NavbarProps;
	PricingMinimal: PricingMinimalProps;
	RichText: RichTextProps;
	Section: SectionProps;
	Spacer: SpacerProps;
	Stack: StackProps;
	Statistics: StatisticsProps;
	Text: TextProps;
	Video: VideoProps;
};

export const demoDataSearchParam = "data";

/**
 * Build a schema-valid {@link PageRootProps} payload for a demo page.
 * `seo` always carries `{ noIndex: false }` so `root.props` parses cleanly
 * through `validatePagePayload` (PRD 0004 F2). The SEO sub-fields are authored
 * by the F5 PageSeoPlugin, not seeded here.
 */
function demoRootProps(
	title: string,
	slug: string,
	status: PageRootProps["status"] = "published",
): PageRootProps {
	return {
		title,
		slug,
		status,
		version: "1.0.0",
		parentFolder: "/",
		seo: { noIndex: false },
	};
}

/**
 * Root inspector fields for the demo page model — title, slug, status,
 * version, parentFolder. SEO (`root.props.seo`) is intentionally NOT an
 * inspector field: the F5 PageSeoPlugin owns SEO authoring. `PageRootProps`
 * makes `seo` required, so Puck's `Fields<PageRootProps>` would demand a `seo`
 * control; the cast omits it while keeping `RootProps = PageRootProps`. The
 * host-owned `remoteComponentLock` root prop (declared below) is outside
 * `PageRootProps` on purpose — it is not page metadata the schema package
 * validates — so the cast goes through `unknown`.
 */
const demoRootFields = {
	title: { type: "text", label: "Title" },
	slug: { type: "text", label: "Slug" },
	status: {
		type: "select",
		label: "Status",
		options: [
			{ label: "Draft", value: "draft" },
			{ label: "Published", value: "published" },
			{ label: "Archived", value: "archived" },
		],
	},
	version: { type: "text", label: "Version" },
	parentFolder: { type: "text", label: "Parent folder" },
	// `root.props.remoteComponentLock` (DD-05 §6.5.2, S1-T04): the host-owned
	// remote-component release lock is a declared root prop so its survival
	// rests on the page contract rather than on storage round-tripping unknown
	// keys. It is machine-managed — the loader/page writer own it, and the
	// page API validates it — so the inspector renders nothing for it.
	remoteComponentLock: {
		type: "custom",
		label: "Remote components",
		render: () => createElement(Fragment),
	},
} as unknown as Fields<PageRootProps>;

/**
 * Build the demo Puck config for a locale. Component field/option labels
 * resolve from each package's bundled catalogs (en/zh/ja/ko) via its
 * `create<Name>Config({ locale })` factory; unknown locales fall back to
 * English per key. Category titles remain host-owned strings.
 */
export function createDemoConfig(
	locale?: string,
): Config<DemoComponents, PageRootProps> {
	const options = locale === undefined ? undefined : { locale };
	// P4-04 (§9.4): every consumer of this factory — the static English
	// config, the editor's locale variants, collab — shares the SAME
	// binding-resolution hooks, so the editor and production resolve
	// bindings identically. Wrapping is idempotent.
	return withBindingResolution({
		categories: {
			navigation: {
				title: "Navigation",
				components: ["Navbar"],
			},
			marketing: {
				title: "Marketing",
				components: [
					"Hero",
					"PricingMinimal",
					"BentoGrid",
					"Section",
					"Statistics",
					"BlogList",
					"Helps",
					"LogoClouds",
				],
			},
			actions: {
				title: "Actions",
				components: ["Button", "Link"],
			},
			forms: {
				title: "Forms",
				components: ["Input"],
			},
			typography: {
				title: "Typography",
				components: [
					"Heading",
					"Text",
					"RichText",
					"Blockquote",
					"Code",
					"List",
				],
			},
			layout: {
				title: "Layout",
				components: ["Container", "Spacer", "Stack", "Grid", "Columns"],
			},
			canvas: {
				title: "Canvas",
				components: ["DesignBlock"],
			},
			media: {
				title: "Media",
				components: ["Image", "Video", "Icon"],
			},
		},
		components: {
			BentoGrid: createBentoGridConfig(options),
			BlogList: createBlogListConfig(options),
			Blockquote: createBlockquoteConfig(options),
			Button: createButtonConfig(options),
			Code: createCodeConfig(options),
			Columns: createColumnsConfig(options),
			Container: createContainerConfig(options),
			DesignBlock: createDesignBlockConfig(options),
			Grid: createGridConfig(options),
			Heading: createHeadingConfig(options),
			Hero: createHeroConfig(options),
			Helps: createHelpsConfig(options),
			Icon: createIconConfig(options),
			Image: createImageConfig(options),
			Input: createInputConfig(options),
			Link: createLinkConfig(options),
			List: createListConfig(options),
			LogoClouds: createLogoCloudsConfig(options),
			Navbar: createNavbarConfig(options),
			PricingMinimal: createPricingMinimalConfig(options),
			RichText: createRichTextConfig(options),
			Section: createSectionConfig(options),
			Spacer: createSpacerConfig(options),
			Stack: createStackConfig(options),
			Statistics: createStatisticsConfig(options),
			Text: createTextConfig(options),
			Video: createVideoConfig(options),
		},
		root: {
			fields: demoRootFields,
			defaultProps: demoRootProps("Untitled", "untitled", "draft"),
		},
	} as unknown as Config) as Config<DemoComponents, PageRootProps>;
}

/** Static English demo config — same shape as before the i18n wiring. */
export const demoConfig: Config<DemoComponents, PageRootProps> =
	createDemoConfig();

export function createDemoData(): Data<DemoComponents, PageRootProps> {
	return {
		root: { props: demoRootProps("Home", "home") },
		content: [
			{
				type: "Navbar",
				props: {
					id: "navbar-primary",
					...navbarDefaultProps,
				},
			},
			{
				type: "Hero",
				props: {
					id: "hero-primary",
					...heroDefaultProps,
				},
			},
			{
				type: "PricingMinimal",
				props: {
					id: "pricing-minimal-primary",
					...pricingMinimalDefaultProps,
				},
			},
			{
				type: "BentoGrid",
				props: {
					id: "bento-grid-primary",
					...bentoGridDefaultProps,
				},
			},
			{
				type: "Section",
				props: {
					id: "section-primary",
					...sectionDefaultProps,
				},
			},
			{
				type: "Statistics",
				props: {
					id: "statistics-primary",
					...statisticsDefaultProps,
				},
			},
			{
				type: "BlogList",
				props: {
					id: "blog-list-primary",
					...blogListDefaultProps,
				},
			},
			{
				type: "Helps",
				props: {
					id: "helps-primary",
					...helpsDefaultProps,
				},
			},
			{
				type: "LogoClouds",
				props: {
					id: "logo-clouds-primary",
					...logoCloudsDefaultProps,
				},
			},
			{
				type: "Input",
				props: {
					id: "input-primary",
					...inputDefaultProps,
				},
			},
			{
				type: "Button",
				props: {
					id: "button-primary",
					...buttonDefaultProps,
				},
			},
		],
	};
}

/**
 * Per-page Puck documents for the demo's multi-page layer sidebar, keyed
 * by the seed page ids in `createPersistedPagesSource`.
 *
 * Each page gets a visually distinct composition so selecting a row in the
 * sidebar obviously swaps the canvas. `home` reuses the full
 * {@link createDemoData} showcase; the others are lighter single-purpose
 * layouts (navbar + one hero/feature block). Pages created at runtime, or
 * any id missing here, fall back to {@link createDemoData} at the call site.
 */
export function createDemoPagesData(): Record<
	string,
	Data<DemoComponents, PageRootProps>
> {
	return {
		home: createDemoData(),
		list: {
			root: { props: demoRootProps("List", "list") },
			content: [
				{ type: "Navbar", props: { id: "list-navbar", ...navbarDefaultProps } },
				{
					type: "BlogList",
					props: { id: "list-blog", ...blogListDefaultProps },
				},
			],
		},
		team: {
			root: { props: demoRootProps("Team", "team") },
			content: [
				{ type: "Navbar", props: { id: "team-navbar", ...navbarDefaultProps } },
				{
					type: "Statistics",
					props: { id: "team-stats", ...statisticsDefaultProps },
				},
			],
		},
		about: {
			root: { props: demoRootProps("About", "about") },
			content: [
				{
					type: "Navbar",
					props: { id: "about-navbar", ...navbarDefaultProps },
				},
				{ type: "Helps", props: { id: "about-helps", ...helpsDefaultProps } },
			],
		},
		profile: {
			root: { props: demoRootProps("Profile", "profile") },
			content: [
				{
					type: "Navbar",
					props: { id: "profile-navbar", ...navbarDefaultProps },
				},
				{ type: "Hero", props: { id: "profile-hero", ...heroDefaultProps } },
			],
		},
		items: {
			root: { props: demoRootProps("Items", "items") },
			content: [
				{
					type: "Navbar",
					props: { id: "items-navbar", ...navbarDefaultProps },
				},
				{
					type: "BentoGrid",
					props: { id: "items-bento", ...bentoGridDefaultProps },
				},
			],
		},
		product: {
			root: { props: demoRootProps("Product", "product") },
			content: [
				{
					type: "Navbar",
					props: { id: "product-navbar", ...navbarDefaultProps },
				},
				{
					type: "PricingMinimal",
					props: { id: "product-pricing", ...pricingMinimalDefaultProps },
				},
			],
		},
	};
}

function getSerializedDemoData(data: Data<DemoComponents, PageRootProps>) {
	return JSON.stringify(data);
}

export function createDemoModeHref(
	pathname: "/puck/editor" | "/puck/render",
	data: Data<DemoComponents, PageRootProps>,
) {
	const searchParams = new URLSearchParams({
		[demoDataSearchParam]: getSerializedDemoData(data),
	});

	return `${pathname}?${searchParams.toString()}`;
}

/**
 * Tiny inline `StudioPlugin` that registers the demo Copywriting
 * snippet pack with the sidebar's `text` module on `onInit` and
 * cleans up on `onDestroy`. Snippet content lives in
 * {@link ./demo-copy-snippet-pack.ts}; this shell exists only to wire
 * it through `ctx.registerCopySnippetPack`.
 */
const demoCopySnippetPluginMeta: StudioPluginMeta = {
	id: "anvilkit-demo-copy-snippets",
	name: "Demo Copywriting Snippets",
	version: "0.0.1",
	coreVersion: "^0.1.0-alpha",
	description:
		"Registers the English demo copy pack with the StudioSidebar `text` module.",
};

export const demoCopySnippetPlugin: StudioPlugin = {
	meta: demoCopySnippetPluginMeta,
	register() {
		let unregister: StudioSidebarUnregister | null = null;
		return {
			meta: demoCopySnippetPluginMeta,
			hooks: {
				onInit: (ctx) => {
					unregister =
						ctx.registerCopySnippetPack?.(demoCopySnippetPack) ?? null;
				},
				onDestroy: () => {
					unregister?.();
					unregister = null;
				},
			},
		};
	},
};

const demoLayerQuickAddPluginMeta: StudioPluginMeta = {
	id: "anvilkit-demo-layer-quickadd",
	name: "Demo Layer Quick-Add",
	version: "0.0.1",
	coreVersion: "^0.1.0-alpha",
	description:
		"Registers a demo layer quick-add so the Layers '+' popover has a clickable entry in the demo (the demo's Puck config does not register the Layout/Row/Column/Text built-ins).",
};

export const demoLayerQuickAddPlugin: StudioPlugin = {
	meta: demoLayerQuickAddPluginMeta,
	register() {
		let unregister: StudioSidebarUnregister | null = null;
		return {
			meta: demoLayerQuickAddPluginMeta,
			hooks: {
				onInit: (ctx) => {
					unregister =
						ctx.registerLayerQuickAdd?.({
							id: "demo-add-hero",
							labelKey: "demo.layer.quickadd.hero",
							order: 10,
							insert: ({ puckApi }) => {
								puckApi.dispatch({
									type: "insert",
									componentType: "Hero",
									destinationIndex: puckApi.appState.data.content.length,
									// Puck keys root content under "root:default-zone"; a bare
									// "default-zone" never matches the root zone, so the insert
									// would silently no-op.
									destinationZone: "root:default-zone",
								});
							},
						}) ?? null;
				},
				onDestroy: () => {
					unregister?.();
					unregister = null;
				},
			},
		};
	},
};

export function getDemoDataFromSearchParam(
	value: string | string[] | null | undefined,
) {
	const serializedData = Array.isArray(value) ? value[0] : value;

	if (!serializedData) {
		return createDemoData();
	}

	try {
		return JSON.parse(serializedData) as Data<DemoComponents, PageRootProps>;
	} catch {
		return createDemoData();
	}
}
