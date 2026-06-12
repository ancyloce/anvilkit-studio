import {
	type BentoGridProps,
	defaultProps as bentoGridDefaultProps,
	createBentoGridConfig,
} from "@anvilkit/bento-grid";
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
import type {
	StudioPlugin,
	StudioPluginMeta,
	StudioSidebarUnregister,
} from "@anvilkit/core";
import {
	createDesignBlockConfig,
	type DesignBlockProps,
} from "@anvilkit/design-block";
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
import {
	createInputConfig,
	type InputProps,
	defaultProps as inputDefaultProps,
} from "@anvilkit/input";
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
import {
	createSectionConfig,
	type SectionProps,
	defaultProps as sectionDefaultProps,
} from "@anvilkit/section";
import {
	createStatisticsConfig,
	type StatisticsProps,
	defaultProps as statisticsDefaultProps,
} from "@anvilkit/statistics";
import type { ComponentConfig, Config, Data } from "@puckeditor/core";
import { createElement } from "react";

import { demoCopySnippetPack } from "./demo-copy-snippet-pack";

/** Minimal media component — the insert target for `kindToComponentName("image")`. */
export type ImageProps = {
	src: string;
	alt: string;
};

export type DemoComponents = {
	BentoGrid: BentoGridProps;
	BlogList: BlogListProps;
	Button: ButtonProps;
	DesignBlock: DesignBlockProps;
	Hero: HeroProps;
	Helps: HelpsProps;
	Image: ImageProps;
	Input: InputProps;
	LogoClouds: LogoCloudsProps;
	Navbar: NavbarProps;
	PricingMinimal: PricingMinimalProps;
	Section: SectionProps;
	Statistics: StatisticsProps;
};

/**
 * A deliberately tiny `<img>` component so the asset-manager sidebar's tile-click
 * insert (`kindToComponentName("image") === "Image"`) resolves to a registered
 * component. The `src` carries an `asset://<id>` reference that the export
 * resolver rewrites to a real URL at publish time.
 */
const imageComponentConfig: ComponentConfig<ImageProps> = {
	label: "Image",
	fields: {
		src: { type: "text" },
		alt: { type: "text" },
	},
	defaultProps: { src: "", alt: "" },
	render: ({ src, alt }) =>
		createElement("img", {
			src,
			alt,
			style: { maxWidth: "100%", height: "auto", display: "block" },
		}),
};

export const demoDataSearchParam = "data";

/**
 * Build the demo Puck config for a locale. Component field/option labels
 * resolve from each package's bundled catalogs (en/zh/ja/ko) via its
 * `create<Name>Config({ locale })` factory; unknown locales fall back to
 * English per key. Category titles and the demo-local `Image` component
 * are host-owned strings and stay English.
 */
export function createDemoConfig(locale?: string): Config<DemoComponents> {
	const options = locale === undefined ? undefined : { locale };
	return {
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
				components: ["Button"],
			},
			forms: {
				title: "Forms",
				components: ["Input"],
			},
			canvas: {
				title: "Canvas",
				components: ["DesignBlock"],
			},
			media: {
				title: "Media",
				components: ["Image"],
			},
		},
		components: {
			BentoGrid: createBentoGridConfig(options),
			BlogList: createBlogListConfig(options),
			Button: createButtonConfig(options),
			DesignBlock: createDesignBlockConfig(options),
			Hero: createHeroConfig(options),
			Helps: createHelpsConfig(options),
			Image: imageComponentConfig,
			Input: createInputConfig(options),
			LogoClouds: createLogoCloudsConfig(options),
			Navbar: createNavbarConfig(options),
			PricingMinimal: createPricingMinimalConfig(options),
			Section: createSectionConfig(options),
			Statistics: createStatisticsConfig(options),
		},
	};
}

/** Static English demo config — same shape as before the i18n wiring. */
export const demoConfig: Config<DemoComponents> = createDemoConfig();

export function createDemoData(): Data<DemoComponents> {
	return {
		root: {},
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
 * by the seed page ids in `createDemoPagesSource` (`lib/demo-pages-source`).
 *
 * Each page gets a visually distinct composition so selecting a row in the
 * sidebar obviously swaps the canvas. `home` reuses the full
 * {@link createDemoData} showcase; the others are lighter single-purpose
 * layouts (navbar + one hero/feature block). Pages created at runtime, or
 * any id missing here, fall back to {@link createDemoData} at the call site.
 */
export function createDemoPagesData(): Record<string, Data<DemoComponents>> {
	return {
		home: createDemoData(),
		list: {
			root: {},
			content: [
				{ type: "Navbar", props: { id: "list-navbar", ...navbarDefaultProps } },
				{
					type: "BlogList",
					props: { id: "list-blog", ...blogListDefaultProps },
				},
			],
		},
		team: {
			root: {},
			content: [
				{ type: "Navbar", props: { id: "team-navbar", ...navbarDefaultProps } },
				{
					type: "Statistics",
					props: { id: "team-stats", ...statisticsDefaultProps },
				},
			],
		},
		about: {
			root: {},
			content: [
				{
					type: "Navbar",
					props: { id: "about-navbar", ...navbarDefaultProps },
				},
				{ type: "Helps", props: { id: "about-helps", ...helpsDefaultProps } },
			],
		},
		profile: {
			root: {},
			content: [
				{
					type: "Navbar",
					props: { id: "profile-navbar", ...navbarDefaultProps },
				},
				{ type: "Hero", props: { id: "profile-hero", ...heroDefaultProps } },
			],
		},
		items: {
			root: {},
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
			root: {},
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

function getSerializedDemoData(data: Data<DemoComponents>) {
	return JSON.stringify(data);
}

export function createDemoModeHref(
	pathname: "/puck/editor" | "/puck/render",
	data: Data<DemoComponents>,
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
		return JSON.parse(serializedData) as Data<DemoComponents>;
	} catch {
		return createDemoData();
	}
}
