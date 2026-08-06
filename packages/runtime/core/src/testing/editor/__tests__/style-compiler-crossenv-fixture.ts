/**
 * @file PLAN-0025 Phase 1 exit gate — shared cross-environment
 * fixture. Imported by BOTH the jsdom spec and the node spec; each
 * compiles it and asserts the identical committed fingerprint, so a
 * platform-dependent code path (Intl, locale sort, DOM leakage)
 * breaks loudly.
 */

import type { Config, Data } from "@puckeditor/core";

export const crossenvConfig: Config = {
	components: {
		Hero: {
			fields: {},
			metadata: {
				anvilkit: {
					editor: {
						version: "2",
						styleTargets: {
							root: {
								label: "Hero",
								responsive: true,
								properties: ["display", "gap", "color", "opacity"],
							},
						},
					},
				},
			},
			render: () => null,
		},
	},
} as unknown as Config;

export const crossenvDocument = {
	content: [
		{
			type: "Hero",
			props: {
				id: "hero-x",
				appearance: {
					version: "1",
					targets: {
						root: {
							style: {
								base: {
									layout: {
										display: "flex",
										gap: { kind: "unit", value: 12, unit: "px" },
									},
									visual: { opacity: 0.75 },
									typography: {
										color: { kind: "token", tokenId: "tok-ink" },
									},
								},
								overrides: {
									"bp-sm": {
										layout: { gap: { kind: "unit", value: 4, unit: "px" } },
									},
								},
							},
							hidden: { overrides: { "bp-sm": true } },
						},
					},
				},
			},
		},
	],
	root: {
		props: {
			designSystem: {
				version: "1",
				breakpoints: [
					{
						id: "bp-sm",
						label: "Small",
						maxWidth: 640,
						order: 0,
						enabled: true,
					},
				],
				tokens: {
					"tok-ink": {
						id: "tok-ink",
						path: ["color", "tok-ink"],
						name: "Ink",
						type: "color",
						values: {
							light: {
								kind: "literal",
								value: { kind: "rgba", r: 1, g: 2, b: 3, a: 1 },
							},
						},
						description: "",
					},
				},
				tokenModes: { light: { id: "light", name: "Light" } },
				defaultTokenMode: "light",
				styleDefinitions: {},
			},
		},
	},
	zones: {},
} as unknown as Data;

export const CROSSENV_FINGERPRINT_GOLDEN = "crossenv-fingerprint.txt";
