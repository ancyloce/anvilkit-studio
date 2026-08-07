/**
 * @file PLAN-0025 §6.1 — component capability metadata v2.
 *
 * Replaces the single v1 `styleTarget` + coarse booleans with NAMED
 * style targets carrying explicit property allowlists. Declared at
 * `metadata.anvilkit.editor` on a Puck component config (the v1
 * `metadata.editor` channel stays untouched during migration).
 *
 * The allowlist is deliberate: the Inspector may expose only controls
 * a component genuinely supports, and the compiler uses the SAME
 * allowlist to reject unauthorized styles (one source of truth).
 * Reuses the v1 inline-text/image/slot target contracts verbatim.
 */

import type {
	ImageTarget,
	InlineTextTarget,
	SlotCapability,
} from "./capability-metadata.js";

/**
 * Every style property an author may be granted, keyed exactly as the
 * authoring specs spell them. Extending this union is a schema change
 * (plan §15 gate 8): new CSS enters here and the capability allowlist
 * before any panel or compiler may emit it.
 */
export type AuthorableStyleProperty =
	| "display"
	| "position"
	| "width"
	| "minWidth"
	| "maxWidth"
	| "height"
	| "margin"
	| "padding"
	| "gap"
	| "alignItems"
	| "justifyContent"
	| "background"
	| "border"
	| "borderRadius"
	| "boxShadow"
	| "opacity"
	| "color"
	| "fontFamily"
	| "fontSize"
	| "fontWeight"
	| "lineHeight"
	| "letterSpacing"
	| "textAlign";

/** One named target's granted authoring surface. */
export interface StyleTargetCapabilityV2 {
	readonly label: string;
	readonly properties: readonly AuthorableStyleProperty[];
	readonly responsive?: boolean;
}

/**
 * The v2 capability declaration. `styleTargets` keys are part of the
 * component's DATA contract: renaming a published target requires a
 * prop migration (plan §6.4).
 */
export interface AnvilComponentMetadataV2 {
	readonly version: "2";
	readonly styleTargets: Readonly<Record<string, StyleTargetCapabilityV2>>;
	readonly inlineText?: readonly InlineTextTarget[];
	readonly images?: readonly ImageTarget[];
	readonly slots?: Readonly<Record<string, SlotCapability>>;
	readonly interactions?: boolean;
	readonly bindings?: boolean;
}
