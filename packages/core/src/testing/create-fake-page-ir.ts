import type { PageIR, PageIRNode } from "../types/ir.js";

export interface CreateFakePageIROverrides {
	/** Override the root id (default `"root"`). */
	readonly rootId?: string;
	/** Override the children array. Default is a single `Hero` node. */
	readonly children?: readonly PageIRNode[];
	/** Attach PageIR assets (default: `[]`). */
	readonly assets?: PageIR["assets"];
	/** Metadata (default: `{ createdAt: "<iso-now>" }`). */
	readonly metadata?: PageIR["metadata"];
}

/**
 * Build a valid `PageIR` for tests. Defaults are chosen so
 * `validateAiOutput` passes without further tweaking — i.e. the
 * default IR contains one `Hero` child with a string headline.
 * Override any part via the options argument.
 */
export function createFakePageIR(
	overrides: CreateFakePageIROverrides = {},
): PageIR {
	return {
		version: "1",
		root: {
			id: overrides.rootId ?? "root",
			type: "__root__",
			props: {},
			children:
				overrides.children ?? [
					{
						id: "hero-1",
						type: "Hero",
						props: { headline: "Hello" },
					},
				],
		},
		assets: overrides.assets ?? [],
		metadata:
			overrides.metadata ?? { createdAt: new Date(0).toISOString() },
	};
}
