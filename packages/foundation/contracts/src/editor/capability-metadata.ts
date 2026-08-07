/**
 * @file Shared component-capability target types.
 *
 * These three are declaration shapes referenced by the canonical
 * component contract (`component-metadata.ts`) at
 * `metadata.anvilkit.editor`. The v1 `EditorCapabilityMetadata`
 * envelope that also lived here was deleted by `p1-005`; these
 * survive because `AnvilComponentMetadata` uses them verbatim, and
 * because `ED-FA-010` (slots) and `ED-FA-011` (image targets) build on
 * them.
 */

/** One declared inline-text editing target (DD-0019 §8, verbatim). */
export interface InlineTextTarget {
	readonly id: string;
	readonly propPath: string;
	readonly format: "plain" | "tiptap";
}

/** One declared image editing target (DD-0019 §8, verbatim). */
export interface ImageTarget {
	readonly id: string;
	readonly srcPropPath: string;
	readonly altPropPath?: string;
	readonly cropPropPath?: string;
}

/**
 * Per-slot capability constraints, keyed by slot field name. Declares
 * what the editor may do inside a slot a component exposes.
 */
export interface SlotCapability {
	/** Component types accepted in this slot; absent = unrestricted. */
	readonly allowedTypes?: readonly string[];
	/** Whether the editor may reorder direct children. Default true. */
	readonly reorder?: boolean;
	/** Whether universal layout controls apply to this slot's container. */
	readonly layoutContainer?: boolean;
}

