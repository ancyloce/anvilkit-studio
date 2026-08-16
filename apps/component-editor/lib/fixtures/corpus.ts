import type { Data } from "@puckeditor/core";
import { componentEditorConfig } from "../editor-config";

/**
 * Parity fixture corpus v0 (plan 0036 P0-06): the six P0 wrappers plus one
 * nested-slot document. Grows to the full 18-wrapper corpus at P1-13 and
 * becomes a required CI gate at P3-03.
 */

export interface CorpusFixture {
	readonly name: string;
	readonly data: Data;
}

const rootProps = (title: string, slug: string) => ({
	title,
	slug,
	description: "",
	status: "draft" as const,
	version: "1",
});

const defaultsOf = (type: string): Record<string, unknown> =>
	({ ...componentEditorConfig.components[type]?.defaultProps }) as Record<
		string,
		unknown
	>;

/**
 * Every registered wrapper once, at its defaults.
 *
 * Derived from the config rather than listed by hand (P1-13): a wrapper
 * added to the editor is covered by the parity suite the moment it is
 * registered, which is what stops the corpus from silently lagging the
 * catalogue as it did between P0 and P1.
 */
const allComponents: Data = {
	root: { props: rootProps("All components", "all-components") },
	content: Object.keys(componentEditorConfig.components)
		.sort()
		.map((type) => ({
			type,
			props: { ...defaultsOf(type), id: `${type.toLowerCase()}-1` },
		})),
	zones: {},
} as unknown as Data;

/**
 * Nested slots: a Card whose `content` slot holds a Badge and a Button, and
 * whose `footer` slot holds a Separator. Slot children are inline component
 * data — the only nesting mechanism (design 0022 §3.3).
 */
const nestedSlots: Data = {
	root: { props: rootProps("Nested slots", "nested-slots") },
	content: [
		{
			type: "Card",
			props: {
				...defaultsOf("Card"),
				id: "card-nested",
				title: "Nested card",
				content: [
					{
						type: "Badge",
						props: { ...defaultsOf("Badge"), id: "badge-in-slot" },
					},
					{
						type: "Button",
						props: { ...defaultsOf("Button"), id: "button-in-slot" },
					},
				],
				footer: [
					{
						type: "Separator",
						props: { ...defaultsOf("Separator"), id: "separator-in-slot" },
					},
				],
			},
		},
	],
	zones: {},
} as unknown as Data;

/**
 * Authored appearance on a declared target — proves the compiled sheet
 * travels with the document rather than being re-derived per surface.
 */
const authoredAppearance: Data = {
	root: { props: rootProps("Authored appearance", "authored-appearance") },
	content: [
		{
			type: "Badge",
			props: {
				...defaultsOf("Badge"),
				id: "badge-styled",
				appearance: {
					targets: { root: { style: { base: { visual: { opacity: 0.5 } } } } },
				},
			},
		},
	],
	zones: {},
} as unknown as Data;

/**
 * Array-nested slots (DOC-01 §3.8): Tabs and Accordion carry a slot INSIDE
 * each array item, which is the one nesting shape the P0 corpus could not
 * cover because neither wrapper existed yet.
 */
const arrayNestedSlots: Data = {
	root: { props: rootProps("Array-nested slots", "array-nested-slots") },
	content: [
		{
			type: "Tabs",
			props: {
				...defaultsOf("Tabs"),
				id: "tabs-nested",
				items: [
					{
						label: "Overview",
						content: [
							{
								type: "Badge",
								props: { ...defaultsOf("Badge"), id: "badge-tab-1" },
							},
						],
					},
					{ label: "Details", content: [] },
				],
			},
		},
		{
			type: "Accordion",
			props: {
				...defaultsOf("Accordion"),
				id: "accordion-nested",
				items: [
					{
						title: "What is included?",
						content: [
							{
								type: "Separator",
								props: { ...defaultsOf("Separator"), id: "separator-panel-1" },
							},
						],
					},
				],
			},
		},
	],
	zones: {},
} as unknown as Data;

/**
 * Authored animation on the visible `animation` field — the other declared
 * carrier surface, which reaches the DOM as classes and custom properties
 * rather than through the compiled stylesheet.
 */
const authoredAnimation: Data = {
	root: { props: rootProps("Authored animation", "authored-animation") },
	content: [
		{
			type: "Badge",
			props: {
				...defaultsOf("Badge"),
				id: "badge-animated",
				animation: {
					preset: "fade-in",
					durationMs: 400,
					delayMs: 100,
					easing: "ease-out",
				},
			},
		},
	],
	zones: {},
} as unknown as Data;

/**
 * Deeply nested slots: a Card inside a Card's slot, to prove nesting depth
 * itself does not break target stamping on either surface.
 */
const deepNesting: Data = {
	root: { props: rootProps("Deep nesting", "deep-nesting") },
	content: [
		{
			type: "Card",
			props: {
				...defaultsOf("Card"),
				id: "card-outer",
				title: "Outer",
				content: [
					{
						type: "Card",
						props: {
							...defaultsOf("Card"),
							id: "card-inner",
							title: "Inner",
							content: [
								{
									type: "Badge",
									props: { ...defaultsOf("Badge"), id: "badge-deep" },
								},
							],
						},
					},
				],
			},
		},
	],
	zones: {},
} as unknown as Data;

export const CORPUS_V0: readonly CorpusFixture[] = [
	{ name: "all components", data: allComponents },
	{ name: "nested slots", data: nestedSlots },
	{ name: "array-nested slots", data: arrayNestedSlots },
	{ name: "deep nesting", data: deepNesting },
	{ name: "authored appearance", data: authoredAppearance },
	{ name: "authored animation", data: authoredAnimation },
];
