import {
	componentConfig as heroConfig,
	type HeroProps,
	defaultProps as heroDefaultProps,
} from "@anvilkit/hero";
import type { Config, Data } from "@puckeditor/core";

export type PlaygroundComponents = {
	Hero: HeroProps;
};

export const playgroundConfig: Config<PlaygroundComponents> = {
	// The Studio insert module renders components from `categories` sections;
	// an uncategorized component does not appear in the sidebar.
	categories: {
		content: { title: "Content", components: ["Hero"] },
	},
	components: {
		Hero: heroConfig,
	},
};

export function createInitialData(): Data<PlaygroundComponents> {
	return {
		root: {},
		content: [
			{
				type: "Hero",
				props: { id: "hero-primary", ...heroDefaultProps },
			},
		],
	};
}
