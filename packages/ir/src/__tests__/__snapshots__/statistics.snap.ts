import type { PageIR } from "@anvilkit/core/types";

export const statistics: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "statistics-1",
				type: "Statistics",
				props: {
					title: "Statistics",
				},
			},
		],
	},
	assets: [],
	metadata: {
		createdAt: "2026-04-11T00:00:00.000Z",
	},
};
