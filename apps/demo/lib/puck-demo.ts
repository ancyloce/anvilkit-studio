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
import type { Config, Data } from "@puckeditor/core";

export type DemoComponents = {
	BentoGrid: BentoGridProps;
	BlogList: BlogListProps;
	Button: ButtonProps;
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
	},
	components: {
		BentoGrid: bentoGridComponentConfig,
		BlogList: blogListComponentConfig,
		Button: buttonComponentConfig,
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
