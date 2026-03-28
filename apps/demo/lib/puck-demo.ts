import {
	type ButtonProps,
	componentConfig as buttonComponentConfig,
	defaultProps as buttonDefaultProps,
} from "@anvilkit/button";
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
	Input: InputProps;
	Navbar: NavbarProps;
};

export const demoConfig: Config<DemoComponents> = {
	categories: {
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
		Input: inputComponentConfig,
		Navbar: navbarComponentConfig,
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
