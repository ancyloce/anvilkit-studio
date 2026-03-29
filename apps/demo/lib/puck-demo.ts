import {
	type ButtonProps,
	componentConfig as buttonComponentConfig,
	defaultProps as buttonDefaultProps,
} from "@anvilkit/button";
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
	type NavbarProps,
	componentConfig as navbarComponentConfig,
	defaultProps as navbarDefaultProps,
} from "@anvilkit/navbar";
import type { Config, Data } from "@puckeditor/core";

export type DemoComponents = {
	Button: ButtonProps;
	Hero: HeroProps;
	Input: InputProps;
	Navbar: NavbarProps;
};

export const demoConfig: Config<DemoComponents> = {
	categories: {
		marketing: {
			title: "Marketing",
			components: ["Hero"],
		},
		navigation: {
			title: "Navigation",
			components: ["Navbar"],
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
		Button: buttonComponentConfig,
		Hero: heroComponentConfig,
		Input: inputComponentConfig,
		Navbar: navbarComponentConfig,
	},
};

export function createDemoData(): Data<DemoComponents> {
	return {
		root: {},
		content: [
			{
				type: "Hero",
				props: {
					id: "hero-primary",
					...heroDefaultProps,
				},
			},
			{
				type: "Navbar",
				props: {
					id: "navbar-primary",
					...navbarDefaultProps,
				},
			},
			{
				type: "Button",
				props: {
					id: "button-primary",
					...buttonDefaultProps,
				},
			},
			{
				type: "Input",
				props: {
					id: "input-email",
					...inputDefaultProps,
				},
			},
		],
	};
}
