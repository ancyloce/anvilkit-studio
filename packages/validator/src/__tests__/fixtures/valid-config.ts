import type { Config } from "@puckeditor/core";

const noop = (() => null) as unknown as Config["components"][string]["render"];

export const validConfig: Config = {
	components: {
		Hero: {
			render: noop,
			fields: {
				title: { type: "text" },
				description: { type: "textarea" },
			},
			defaultProps: {
				title: "Hello",
				description: "World",
			},
			metadata: {
				description: "A hero banner component",
			},
		} as Config["components"][string],
	},
};
