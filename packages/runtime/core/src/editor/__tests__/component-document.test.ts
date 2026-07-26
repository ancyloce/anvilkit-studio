/**
 * Definition ⇄ document projection for the isolated component canvas
 * (PLAN-0020 CORE-P2-009F; DD-DEC-010; DD-0019 §14.2, §14.4).
 */

import type {
	ComponentDefinitionV1,
	SerializablePuckNode,
} from "@anvilkit/contracts/editor";
import type { Data as PuckData } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
	componentDocument,
	foldComponentDocument,
	variantCombinations,
} from "../index.js";

const DEFINITION: ComponentDefinitionV1 = {
	version: "1",
	id: "def",
	name: "Card",
	root: {
		type: "Box",
		props: {
			id: "n-root",
			label: "base",
			children: [{ type: "Text", props: { id: "n-text", text: "hi" } }],
		},
	} as unknown as SerializablePuckNode,
	exposedProps: [],
	variantAxes: [
		{
			id: "size",
			name: "Size",
			options: [
				{ id: "sm", name: "Small" },
				{ id: "lg", name: "Large" },
			],
		},
	],
	variants: [
		{
			id: "v-lg",
			selection: { size: "lg" },
			patch: { "n-root": { props: { label: "large" } } },
		},
		{ id: "v-sm", selection: { size: "sm" }, patch: {} },
	],
	revision: 1,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

const rootOf = (data: PuckData) =>
	(data.content ?? [])[0] as unknown as SerializablePuckNode;

describe("componentDocument", () => {
	it("projects the definition base as a one-root document", () => {
		const doc = componentDocument(DEFINITION);
		expect(doc.content).toHaveLength(1);
		expect(rootOf(doc).props.label).toBe("base");
	});

	it("applies the matching variant patch", () => {
		const doc = componentDocument(DEFINITION, { size: "lg" });
		expect(rootOf(doc).props.label).toBe("large");
	});

	it("preserves definition node ids in both directions (§14.2)", () => {
		// Regenerating ids would orphan every override that targets them.
		const doc = componentDocument(DEFINITION, { size: "lg" });
		const root = rootOf(doc);
		expect(root.props.id).toBe("n-root");
		const child = (root.props.children as unknown as SerializablePuckNode[])[0];
		expect(child?.props.id).toBe("n-text");
	});

	it("renders the base for an unmatched combination", () => {
		const doc = componentDocument(DEFINITION, { size: "xl" });
		expect(rootOf(doc).props.label).toBe("base");
	});
});

describe("foldComponentDocument", () => {
	it("folds a main-component edit into the definition root", () => {
		const doc = componentDocument(DEFINITION);
		const edited = {
			...doc,
			content: [
				{
					...rootOf(doc),
					props: { ...rootOf(doc).props, label: "edited" },
				},
			],
		} as unknown as PuckData;
		const sink = foldComponentDocument(DEFINITION, edited);
		expect(sink?.kind).toBe("definition");
		if (sink?.kind === "definition") {
			expect(sink.root.props.label).toBe("edited");
		}
	});

	it("folds a variant edit into that variant's patch, not the base", () => {
		// The difference between "change this component" and "change how
		// it looks when large".
		const doc = componentDocument(DEFINITION, { size: "lg" });
		const edited = {
			...doc,
			content: [
				{
					...rootOf(doc),
					props: { ...rootOf(doc).props, label: "larger still" },
				},
			],
		} as unknown as PuckData;
		const sink = foldComponentDocument(DEFINITION, edited, { size: "lg" });
		expect(sink?.kind).toBe("variant");
		if (sink?.kind === "variant") {
			expect(sink.variantId).toBe("v-lg");
			expect(sink.patch["n-root"]?.props).toEqual({ label: "larger still" });
		}
	});

	it("drops a variant patch entry when the edit reverts to the base", () => {
		const doc = componentDocument(DEFINITION, { size: "lg" });
		const reverted = {
			...doc,
			content: [
				{ ...rootOf(doc), props: { ...rootOf(doc).props, label: "base" } },
			],
		} as unknown as PuckData;
		const sink = foldComponentDocument(DEFINITION, reverted, { size: "lg" });
		if (sink?.kind === "variant") {
			expect(sink.patch["n-root"]).toBeUndefined();
		}
	});

	it("project → fold is idempotent for an untouched variant", () => {
		// Opening a variant and closing it without editing must leave the
		// patch exactly as it was — not empty it (which would silently
		// discard the variant) and not double it.
		const doc = componentDocument(DEFINITION, { size: "lg" });
		const sink = foldComponentDocument(DEFINITION, doc, { size: "lg" });
		if (sink?.kind !== "variant") {
			throw new Error("expected a variant sink");
		}
		const original = DEFINITION.variants.find(
			(variant) => variant.id === "v-lg",
		);
		expect(sink.patch).toEqual(original?.patch);

		// And folding the same projection again is stable.
		const again = foldComponentDocument(
			{
				...DEFINITION,
				variants: DEFINITION.variants.map((variant) =>
					variant.id === "v-lg" ? { ...variant, patch: sink.patch } : variant,
				),
			},
			doc,
			{ size: "lg" },
		);
		if (again?.kind === "variant") {
			expect(again.patch).toEqual(sink.patch);
		}
	});

	it("rejects a document that is not a projection of this definition", () => {
		expect(
			foldComponentDocument(DEFINITION, {
				root: { props: {} },
				content: [{ type: "Box", props: { id: "someone-else" } }],
				zones: {},
			} as unknown as PuckData),
		).toBeNull();
		expect(
			foldComponentDocument(DEFINITION, {
				root: { props: {} },
				content: [],
				zones: {},
			} as unknown as PuckData),
		).toBeNull();
	});

	it("never mutates its inputs", () => {
		const snapshot = JSON.parse(JSON.stringify(DEFINITION));
		const doc = componentDocument(DEFINITION, { size: "lg" });
		foldComponentDocument(DEFINITION, doc, { size: "lg" });
		expect(DEFINITION).toEqual(snapshot);
	});
});

describe("variantCombinations", () => {
	it("enumerates the cartesian product of the axes", () => {
		expect(variantCombinations(DEFINITION)).toEqual([
			{ size: "sm" },
			{ size: "lg" },
		]);
	});

	it("returns the empty combination for an axis-less component", () => {
		expect(variantCombinations({ ...DEFINITION, variantAxes: [] })).toEqual([
			{},
		]);
	});

	it("multiplies across two axes", () => {
		const twoAxis: ComponentDefinitionV1 = {
			...DEFINITION,
			variantAxes: [
				...DEFINITION.variantAxes,
				{
					id: "tone",
					name: "Tone",
					options: [
						{ id: "light", name: "Light" },
						{ id: "dark", name: "Dark" },
					],
				},
			],
		};
		expect(variantCombinations(twoAxis)).toHaveLength(4);
	});
});
