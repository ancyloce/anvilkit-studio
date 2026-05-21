import type { PageIR } from "@anvilkit/core/types";

export const navbar: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "navbar-1",
				type: "Navbar",
				props: {
					actions: [
						{
							disabled: false,
							href: "/signup",
							label: "Sign up",
							openInNewTab: false,
							size: "lg",
							variant: "secondary",
						},
					],
					active: "/features",
					items: [
						{
							href: "/overview",
							label: "Overview",
						},
						{
							href: "/features",
							label: "Features",
						},
						{
							href: "/integrations",
							label: "Integrations",
						},
						{
							href: "/customers",
							label: "Customers",
						},
						{
							href: "/changelog",
							label: "Changelog",
						},
					],
					logo: {
						alt: "Underline",
						href: "/",
						imageUrl: "",
						text: "Underline",
						type: "text",
					},
				},
			},
		],
	},
	assets: [],
	metadata: {
		createdAt: "2026-04-11T00:00:00.000Z",
	},
};
