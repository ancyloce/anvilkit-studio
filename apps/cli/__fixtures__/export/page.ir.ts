import type { PageIR } from "@anvilkit/core/types";

export const pageIR: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "hero-1",
				type: "Hero",
				props: {},
			},
		],
	},
	assets: [],
	metadata: {},
};

export default pageIR;
