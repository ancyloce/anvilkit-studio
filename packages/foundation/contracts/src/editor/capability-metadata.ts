/**
 * @file Component capability contract (DD-0019 §8).
 *
 * Declared under the existing Puck component config at
 * `metadata.editor`. Explicit metadata always wins over the legacy
 * text/image drop heuristics. Absent metadata is equivalent to
 * `styleTarget: "none"` — native fields, slots, drawer behavior, and
 * preview remain unchanged (DD-DEC-015/-016).
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

/**
 * The component capability metadata (DD-0019 §8, verbatim), declared
 * at `metadata.editor` on a Puck component config.
 */
export interface EditorCapabilityMetadata {
	readonly version: "1";
	readonly styleTarget: "root" | "wrapper" | "none";
	readonly capabilities: {
		readonly layoutItem?: boolean;
		readonly layoutContainer?: boolean;
		readonly visualStyle?: boolean;
		readonly typography?: boolean;
		readonly responsive?: boolean;
		readonly interactions?: boolean;
		readonly bindings?: boolean;
		readonly inlineText?: readonly InlineTextTarget[];
		readonly imageAdjust?: readonly ImageTarget[];
	};
	readonly slotMap?: Readonly<Record<string, SlotCapability>>;
}
