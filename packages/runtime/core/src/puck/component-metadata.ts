/**
 * @file Metadata-v2 interpretation (PLAN-0025 §6.1) — ONE reading of
 * `metadata.anvilkit.editor` shared by every consumer: the Inspector
 * exposes only the controls a component genuinely declares, and the
 * compiler enforces the same allowlist, because both read THIS module.
 * React-free.
 *
 * Structurally tolerant by design: anything that is not a well-formed
 * v2 declaration reads as "no declared targets" — the Style tab then
 * shows its undeclared state (§8.5) instead of fabricating support.
 */

import type {
	AnvilComponentMetadata,
	AuthorableStyleProperty,
} from "@anvilkit/contracts/editor";
import { StyleTargetCapabilitySchema } from "@anvilkit/schema/editor";
import type { Config } from "@puckeditor/core";

/** One declared style target, validated and label included. */
export interface ResolvedStyleTarget {
	readonly id: string;
	readonly label: string;
	readonly responsive: boolean;
	readonly properties: readonly AuthorableStyleProperty[];
}

/**
 * The component's `metadata.anvilkit.editor` v2 declaration, or
 * `undefined` for absent, malformed or unknown component types.
 */
export function readEditorMetadata(
	component: unknown,
): AnvilComponentMetadata | undefined {
	const editor = (
		component as
			| { metadata?: { anvilkit?: { editor?: AnvilComponentMetadata } } }
			| undefined
	)?.metadata?.anvilkit?.editor;
	// Structural validation only — there is no version discriminator
	// (PLAN-0026 §3.3). A component declaring `styleTargets` is
	// declaring the contract; one without it is not.
	return editor !== undefined &&
		typeof editor === "object" &&
		typeof editor.styleTargets === "object" &&
		editor.styleTargets !== null
		? editor
		: undefined;
}

/** Family + spec key that stores one authorable property. */
export interface AuthorablePropertyLocation {
	readonly family: "layout" | "visual" | "typography";
	readonly specKey: string;
}

/**
 * The canonical storage location of every grantable §6.1 property in
 * the authoring specs — the ONE property vocabulary translation, used
 * by the Inspector reads model and the compiler's allowlist filter
 * alike. Two members are spelled differently from their spec keys
 * (`borderRadius` → `radius`, `boxShadow` → `shadows`); every other
 * member maps 1:1. Every spec key has an entry: the vocabulary was
 * widened to the full 40-property grantable set by `p1-004`
 * (ED-FA-001), so nothing drops at the allowlist for lack of a
 * mapping. What a given component actually GRANTS is still its own
 * per-target decision (`p6-003`).
 */
export const AUTHORABLE_PROPERTY_LOCATIONS: Readonly<
	Record<AuthorableStyleProperty, AuthorablePropertyLocation>
> = {
	display: { family: "layout", specKey: "display" },
	position: { family: "layout", specKey: "position" },
	width: { family: "layout", specKey: "width" },
	minWidth: { family: "layout", specKey: "minWidth" },
	maxWidth: { family: "layout", specKey: "maxWidth" },
	height: { family: "layout", specKey: "height" },
	margin: { family: "layout", specKey: "margin" },
	padding: { family: "layout", specKey: "padding" },
	gap: { family: "layout", specKey: "gap" },
	alignItems: { family: "layout", specKey: "alignItems" },
	justifyContent: { family: "layout", specKey: "justifyContent" },
	background: { family: "visual", specKey: "background" },
	border: { family: "visual", specKey: "border" },
	borderRadius: { family: "visual", specKey: "radius" },
	boxShadow: { family: "visual", specKey: "shadows" },
	opacity: { family: "visual", specKey: "opacity" },
	color: { family: "typography", specKey: "color" },
	fontFamily: { family: "typography", specKey: "fontFamily" },
	fontSize: { family: "typography", specKey: "fontSize" },
	fontWeight: { family: "typography", specKey: "fontWeight" },
	lineHeight: { family: "typography", specKey: "lineHeight" },
	letterSpacing: { family: "typography", specKey: "letterSpacing" },
	textAlign: { family: "typography", specKey: "textAlign" },
	direction: { family: "layout", specKey: "direction" },
	wrap: { family: "layout", specKey: "wrap" },
	rowGap: { family: "layout", specKey: "rowGap" },
	columnGap: { family: "layout", specKey: "columnGap" },
	columns: { family: "layout", specKey: "columns" },
	rows: { family: "layout", specKey: "rows" },
	minHeight: { family: "layout", specKey: "minHeight" },
	maxHeight: { family: "layout", specKey: "maxHeight" },
	inset: { family: "layout", specKey: "inset" },
	overflow: { family: "layout", specKey: "overflow" },
	zIndex: { family: "layout", specKey: "zIndex" },
	filter: { family: "visual", specKey: "filter" },
	blendMode: { family: "visual", specKey: "blendMode" },
	cursor: { family: "visual", specKey: "cursor" },
	textDecoration: { family: "typography", specKey: "textDecoration" },
	textTransform: { family: "typography", specKey: "textTransform" },
	textWrap: { family: "typography", specKey: "textWrap" },
};

const PROPERTY_BY_FAMILY_SPEC_KEY: ReadonlyMap<
	string,
	AuthorableStyleProperty
> = new Map(
	(
		Object.entries(AUTHORABLE_PROPERTY_LOCATIONS) as [
			AuthorableStyleProperty,
			AuthorablePropertyLocation,
		][]
	).map(([property, location]) => [
		`${location.family}:${location.specKey}`,
		property,
	]),
);

/**
 * The grantable property stored at `family`/`specKey`, or `undefined`
 * for spec keys outside the §6.1 vocabulary.
 */
export function authorablePropertyForSpecKey(
	family: AuthorablePropertyLocation["family"],
	specKey: string,
): AuthorableStyleProperty | undefined {
	return PROPERTY_BY_FAMILY_SPEC_KEY.get(`${family}:${specKey}`);
}

/**
 * The component's declared style targets in declaration order, each
 * schema-validated; malformed targets are skipped, not guessed at.
 * Returns `[]` when the component declares no v2 metadata — callers
 * that must distinguish "v2 with zero targets" from "no v2 at all" use
 * {@link readEditorMetadataFor} first.
 */
export function resolveStyleTargets(
	config: Config,
	type: string,
): readonly ResolvedStyleTarget[] {
	const editor = readEditorMetadataFor(config, type);
	if (editor === undefined) return [];
	const targets: ResolvedStyleTarget[] = [];
	for (const [id, capability] of Object.entries(editor.styleTargets ?? {})) {
		const parsed = StyleTargetCapabilitySchema.safeParse(capability);
		if (!parsed.success) continue;
		targets.push({
			id,
			label: parsed.data.label,
			responsive: parsed.data.responsive === true,
			properties: parsed.data.properties,
		});
	}
	return targets;
}


/**
 * Convenience over {@link readEditorMetadata} for the common case of
 * looking a component up in a Puck `Config` by type.
 */
export function readEditorMetadataFor(
	config: Config,
	type: string,
): AnvilComponentMetadata | undefined {
	return readEditorMetadata((config.components ?? {})[type]);
}

/**
 * Properties whose presence means a target LAYS OUT ITS CHILDREN, and
 * properties whose presence means a target IS SIZED BY ITS PARENT.
 *
 * The v1 contract carried this as two hand-maintained booleans
 * (`capabilities.layoutContainer` / `layoutItem`). The canonical
 * contract does not, and does not need to: the granted property set
 * already says which. A target granting `gap` is declaring that it
 * arranges children; one granting `width` is declaring it can be
 * sized. Deriving is strictly more precise than the v1 booleans were,
 * because it is per TARGET rather than per component — and it cannot
 * drift from the property list the way a parallel boolean can.
 *
 * Properties in neither set (`overflow`, `zIndex`, …) say nothing
 * about layout role and are deliberately absent from both.
 */
const CONTAINER_PROPERTIES: ReadonlySet<AuthorableStyleProperty> = new Set([
	"display",
	"gap",
	"rowGap",
	"columnGap",
	"padding",
	"columns",
	"rows",
	"alignItems",
	"justifyContent",
	"direction",
	"wrap",
]);

const ITEM_PROPERTIES: ReadonlySet<AuthorableStyleProperty> = new Set([
	"width",
	"height",
	"minWidth",
	"maxWidth",
	"minHeight",
	"maxHeight",
	"margin",
	"inset",
	"position",
]);

/** Every property granted by any declared target, deduplicated. */
export function grantedProperties(
	metadata: AnvilComponentMetadata | undefined,
): ReadonlySet<AuthorableStyleProperty> {
	const granted = new Set<AuthorableStyleProperty>();
	for (const target of Object.values(metadata?.styleTargets ?? {})) {
		for (const property of target.properties) granted.add(property);
	}
	return granted;
}

/** Whether any declared target grants a property in `family`. */
export function grantsFamily(
	metadata: AnvilComponentMetadata | undefined,
	family: AuthorablePropertyLocation["family"],
): boolean {
	for (const property of grantedProperties(metadata)) {
		if (AUTHORABLE_PROPERTY_LOCATIONS[property]?.family === family) {
			return true;
		}
	}
	return false;
}

/** Whether any declared target grants `property`. */
export function grantsProperty(
	metadata: AnvilComponentMetadata | undefined,
	property: AuthorableStyleProperty,
): boolean {
	return grantedProperties(metadata).has(property);
}

/** Replaces v1 `capabilities.layoutContainer` — see the note above. */
export function grantsLayoutContainer(
	metadata: AnvilComponentMetadata | undefined,
): boolean {
	for (const property of grantedProperties(metadata)) {
		if (CONTAINER_PROPERTIES.has(property)) return true;
	}
	return false;
}

/** Replaces v1 `capabilities.layoutItem` — see the note above. */
export function grantsLayoutItem(
	metadata: AnvilComponentMetadata | undefined,
): boolean {
	for (const property of grantedProperties(metadata)) {
		if (ITEM_PROPERTIES.has(property)) return true;
	}
	return false;
}
