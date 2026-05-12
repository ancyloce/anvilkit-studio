import type { Config } from "@puckeditor/core";
import { createElement } from "react";

const shellStyle = {
	minHeight: "100vh",
	display: "grid",
	placeItems: "center",
	padding: "4rem 1.5rem",
	background:
		"linear-gradient(135deg, rgba(255,247,237,1) 0%, rgba(255,255,255,1) 50%, rgba(236,254,255,1) 100%)",
} as const;

const copyStyle = {
	maxWidth: "48rem",
	textAlign: "center",
	display: "grid",
	gap: "1rem",
} as const;

const eyebrowStyle = {
	margin: 0,
	textTransform: "uppercase",
	letterSpacing: "0.18em",
	fontSize: "0.75rem",
	fontWeight: 700,
	color: "#0f766e",
} as const;

const headingStyle = {
	margin: 0,
	fontSize: "clamp(2.5rem, 8vw, 4.5rem)",
	lineHeight: 1.02,
	color: "#0f172a",
} as const;

const bodyStyle = {
	margin: 0,
	fontSize: "1rem",
	lineHeight: 1.6,
	color: "#334155",
} as const;

export const puckConfig: Config = {
	components: {
		Heading: {
			fields: {
				text: {
					type: "text",
				},
			},
			defaultProps: {
				text: "Hello from __NAME__",
			},
			render: ({ text }) =>
				createElement(
					"section",
					{ style: shellStyle },
					createElement(
						"div",
						{ style: copyStyle },
						createElement("p", { style: eyebrowStyle }, "Anvilkit"),
						createElement("h1", { style: headingStyle }, text as string),
						createElement(
							"p",
							{ style: bodyStyle },
							"Edit the heading in /puck/editor, or hydrate this route with a seed template via anvilkit init --template <slug>.",
						),
					),
				),
		},
	},
};
