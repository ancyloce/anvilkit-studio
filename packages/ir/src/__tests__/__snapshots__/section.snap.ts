import type { PageIR } from "@anvilkit/core/types";

export const section: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "section-1",
				type: "Section",
				props: {
					badgeLabel: "Scale",
					description:
						"Your AI agent handles repetitive coding tasks, reviews every commit, and catches bugs before deployment. Spend time on architecture, not syntax.",
					headline: "Stop writing boilerplate.",
					highlightedHeadline: "Start building features.",
				},
			},
		],
	},
	assets: [],
	metadata: {
		createdAt: "2026-04-11T00:00:00.000Z",
	},
};
