/**
 * @file Shared §14.6 bench fixtures (PLAN-0025). One document builder
 * feeds both the P1-07 compiler bench and the P2-00 `setData` spike so
 * their node counts, appearance shapes, and one-node-change semantics
 * stay comparable — the spike's go/no-go arithmetic adds the two
 * numbers together, which is only meaningful if they compile the same
 * document.
 *
 * Not a test file: exports only. Lives in `__tests__` so the bench
 * include (`src/**\/__tests__/**\/*.bench.ts`) cannot pick it up while
 * the unit include (`*.{test,spec}.*`) ignores it too.
 */

import type { Config, Data } from "@puckeditor/core";

/** §14.6 fixed node counts. */
export const BENCH_NODE_COUNTS = [50, 500, 2000] as const;

/**
 * The bench Config: one `Box` component with a metadata-v2 `root`
 * target. `render` is injectable so the P2-00 spike can count render
 * invocations; the compiler bench keeps the default no-op.
 */
export function buildBenchConfig(
	render: (props: Record<string, unknown>) => unknown = () => null,
): Config {
	return {
		components: {
			Box: {
				fields: {},
				metadata: {
					anvilkit: {
						editor: {
							version: "2",
							styleTargets: {
								root: {
									label: "Box",
									responsive: true,
									properties: ["display", "gap", "padding", "opacity"],
								},
							},
						},
					},
				},
				render,
			},
		},
	} as unknown as Config;
}

/** The P1-07 document: `nodeCount` styled Boxes + one breakpoint. */
export function buildBenchDocument(nodeCount: number): Data {
	return {
		content: Array.from({ length: nodeCount }, (_, index) => ({
			type: "Box",
			props: {
				id: `box-${index}`,
				appearance: {
					version: "1",
					targets: {
						root: {
							style: {
								base: {
									layout: {
										display: index % 2 === 0 ? "flex" : "block",
										gap: { kind: "unit", value: index % 32, unit: "px" },
									},
									visual: { opacity: (index % 10) / 10 },
								},
								overrides: {
									"bp-sm": {
										layout: {
											gap: { kind: "unit", value: index % 8, unit: "px" },
										},
									},
								},
							},
						},
					},
				},
			},
		})),
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
					tokens: {},
					tokenModes: { light: { id: "light", name: "Light" } },
					defaultTokenMode: "light",
					styleDefinitions: {},
				},
			},
		},
		zones: {},
	} as unknown as Data;
}

/**
 * A one-node appearance change: `seed` alternates the display value so
 * consecutive commits always change data (a repeat would be a no-op
 * and measure nothing).
 */
export function oneNodeChangeAppearance(seed = 0): Record<string, unknown> {
	return {
		version: "1",
		targets: {
			root: {
				style: {
					base: {
						layout: { display: seed % 2 === 0 ? "grid" : "inline-flex" },
					},
				},
			},
		},
	};
}

/**
 * Pure one-node update: shallow-clones the path to `content[index]`
 * and leaves every other node's objects identity-preserved — the shape
 * `updateAppearanceInData` (P2-04) will produce, and the shape the
 * compiler cache keys on.
 */
export function withNodeAppearance(
	data: Data,
	index: number,
	appearance: Record<string, unknown>,
): Data {
	const document = data as unknown as {
		content: { type: string; props: Record<string, unknown> }[];
		root: unknown;
		zones: unknown;
	};
	return {
		...document,
		content: document.content.map((item, at) =>
			at === index ? { ...item, props: { ...item.props, appearance } } : item,
		),
	} as unknown as Data;
}
