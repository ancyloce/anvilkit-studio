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

/** Every registered wrapper once, at its defaults. */
const allComponents: Data = {
	root: { props: rootProps("All components", "all-components") },
	content: [
		{ type: "Badge", props: { ...defaultsOf("Badge"), id: "badge-1" } },
		{ type: "Button", props: { ...defaultsOf("Button"), id: "button-1" } },
		{ type: "Card", props: { ...defaultsOf("Card"), id: "card-1" } },
		{ type: "Input", props: { ...defaultsOf("Input"), id: "input-1" } },
		{ type: "Select", props: { ...defaultsOf("Select"), id: "select-1" } },
		{
			type: "Separator",
			props: { ...defaultsOf("Separator"), id: "separator-1" },
		},
	],
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

export const CORPUS_V0: readonly CorpusFixture[] = [
	{ name: "all components", data: allComponents },
	{ name: "nested slots", data: nestedSlots },
	{ name: "authored appearance", data: authoredAppearance },
];
