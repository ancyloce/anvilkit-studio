import {
	type HeroProps,
	componentConfig as heroComponentConfig,
	defaultProps as heroDefaultProps,
} from "@anvilkit/hero";
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
	Hero: HeroProps;
	LogoClouds: LogoCloudsProps;
	Navbar: NavbarProps;
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
			components: ["Hero", "Section", "Statistics", "LogoClouds"],
		},
	},
	components: {
		Hero: heroComponentConfig,
		LogoClouds: logoCloudsComponentConfig,
		Navbar: navbarComponentConfig,
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
				type: "LogoClouds",
				props: {
					id: "logo-clouds-primary",
					...logoCloudsDefaultProps,
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
