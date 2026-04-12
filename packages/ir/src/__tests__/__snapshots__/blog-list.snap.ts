import type { PageIR } from "@anvilkit/core/types";

export const blogList: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "blog-list-1",
				type: "BlogList",
				props: {
					posts: [
						{
							description:
								"Introducing Acme.ai, a cutting-edge AI solution for modern businesses.",
							href: "/blog/how-dev-ai",
							imageAlt: "How Dev AI?",
							imageSrc:
								"https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&auto=format&fit=crop&q=80",
							openInNewTab: false,
							publishedAt: "2024-11-01",
							publishedLabel: "November 1, 2024",
							relativeLabel: "8mo ago",
							title: "How Dev AI?",
						},
						{
							description:
								"Introducing Acme.ai, a cutting-edge AI solution for modern businesses.",
							href: "/blog/why-dev-ai",
							imageAlt: "Why Dev AI?",
							imageSrc:
								"https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&auto=format&fit=crop&q=80",
							openInNewTab: false,
							publishedAt: "2024-11-01",
							publishedLabel: "November 1, 2024",
							relativeLabel: "8mo ago",
							title: "Why Dev AI?",
						},
						{
							description:
								"Introducing Acme.ai, a cutting-edge AI solution for modern businesses.",
							href: "/blog/introducing-dev-ai",
							imageAlt: "Introducing Acme.ai",
							imageSrc:
								"https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&auto=format&fit=crop&q=80",
							openInNewTab: false,
							publishedAt: "2024-08-29",
							publishedLabel: "August 29, 2024",
							relativeLabel: "10mo ago",
							title: "Introducing Acme.ai",
						},
					],
				},
				assets: [
					{
						id: "asset-1455da9d",
						kind: "other",
						url: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&auto=format&fit=crop&q=80",
					},
				],
			},
		],
	},
	assets: [
		{
			id: "asset-1455da9d",
			kind: "other",
			url: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&auto=format&fit=crop&q=80",
		},
	],
	metadata: {
		createdAt: "2026-04-11T00:00:00.000Z",
	},
};
