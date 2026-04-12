import type { PageIR } from "@anvilkit/core/types";

export const bentoGrid: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "bento-grid-1",
				type: "BentoGrid",
				props: {
					items: [
						{
							icon: "brain",
							title: "Simple Agent Workflows",
							description:
								"Easily create and manage AI agent workflows with intuitive APIs.",
							ctaHref: "#",
						},
						{
							icon: "users",
							title: "Multi-Agent Systems",
							description:
								"Build complex systems with multiple AI agents working together.",
							ctaHref: "#",
						},
						{
							icon: "plug",
							title: "Tool Integration",
							description:
								"Seamlessly integrate external tools and APIs into your agent workflows.",
							ctaHref: "#",
						},
						{
							icon: "globe",
							title: "Cross-Language Support",
							description:
								"Available in all major programming languages for maximum flexibility.",
							ctaHref: "#",
						},
						{
							icon: "code",
							title: "Customizable Agents",
							description:
								"Design and customize agents to fit your specific use case and requirements.",
							ctaHref: "#",
						},
						{
							icon: "zap",
							title: "Efficient Execution",
							description:
								"Optimize agent performance with built-in efficiency and scalability features.",
							ctaHref: "#",
						},
					],
					platform: "adaptive",
					theme: "dark",
				},
			},
		],
	},
	assets: [],
	metadata: {
		createdAt: "2026-04-11T00:00:00.000Z",
	},
};
