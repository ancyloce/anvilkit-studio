import {
	type BentoGridProps,
	componentConfig as bentoGridComponentConfig,
	defaultProps as bentoGridDefaultProps,
} from "@anvilkit/bento-grid";
import {
	type BlogListProps,
	componentConfig as blogListComponentConfig,
	defaultProps as blogListDefaultProps,
} from "@anvilkit/blog-list";
import {
	type ButtonProps,
	componentConfig as buttonComponentConfig,
	defaultProps as buttonDefaultProps,
} from "@anvilkit/button";
import {
	type DesignBlockProps,
	componentConfig as designBlockComponentConfig,
} from "@anvilkit/design-block";
import {
	type HelpsProps,
	componentConfig as helpsComponentConfig,
	defaultProps as helpsDefaultProps,
} from "@anvilkit/helps";
import {
	type HeroProps,
	componentConfig as heroComponentConfig,
	defaultProps as heroDefaultProps,
} from "@anvilkit/hero";
import {
	type InputProps,
	componentConfig as inputComponentConfig,
	defaultProps as inputDefaultProps,
} from "@anvilkit/input";
import {
	type LogoCloudsProps,
	componentConfig as logoCloudsComponentConfig,
	defaultProps as logoCloudsDefaultProps,
} from "@anvilkit/logo-clouds";
import {
	type NavbarProps,
	componentConfig as navbarComponentConfig,
	defaultProps as navbarDefaultProps,
} from "@anvilkit/navbar";
import {
	type PricingMinimalProps,
	componentConfig as pricingMinimalComponentConfig,
	defaultProps as pricingMinimalDefaultProps,
} from "@anvilkit/pricing-minimal";
import {
	type SectionProps,
	componentConfig as sectionComponentConfig,
	defaultProps as sectionDefaultProps,
} from "@anvilkit/section";
import {
	type StatisticsProps,
	componentConfig as statisticsComponentConfig,
	defaultProps as statisticsDefaultProps,
} from "@anvilkit/statistics";
import type {
	StudioPlugin,
	StudioPluginMeta,
	StudioSidebarUnregister,
} from "@anvilkit/core";
import type { Config, Data } from "@puckeditor/core";

import { demoCopySnippetPack } from "./demo-copy-snippet-pack";

export type DemoComponents = {
	BentoGrid: BentoGridProps;
	BlogList: BlogListProps;
	Button: ButtonProps;
	DesignBlock: DesignBlockProps;
	Hero: HeroProps;
	Helps: HelpsProps;
	Input: InputProps;
	LogoClouds: LogoCloudsProps;
	Navbar: NavbarProps;
	PricingMinimal: PricingMinimalProps;
	Section: SectionProps;
	Statistics: StatisticsProps;
};

export const demoDataSearchParam = "data";

export const demoConfig: Config<DemoComponents> = {
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
	},
	components: {
		BentoGrid: bentoGridComponentConfig,
		BlogList: blogListComponentConfig,
		Button: buttonComponentConfig,
		DesignBlock: designBlockComponentConfig,
		Hero: heroComponentConfig,
		Helps: helpsComponentConfig,
		Input: inputComponentConfig,
		LogoClouds: logoCloudsComponentConfig,
		Navbar: navbarComponentConfig,
		PricingMinimal: pricingMinimalComponentConfig,
		Section: sectionComponentConfig,
		Statistics: statisticsComponentConfig,
	},
};

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
									destinationZone: "default-zone",
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
