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
	AnvilComponentMetadataV2,
	AuthorableStyleProperty,
} from "@anvilkit/contracts/editor";
import { StyleTargetCapabilityV2Schema } from "@anvilkit/schema/editor";
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
 * `undefined` for absent/non-v2/unknown component types.
 */
export function readEditorMetadataV2(
	config: Config,
	type: string,
): AnvilComponentMetadataV2 | undefined {
	const component = (config.components ?? {})[type] as
		| { metadata?: { anvilkit?: { editor?: AnvilComponentMetadataV2 } } }
		| undefined;
	const editor = component?.metadata?.anvilkit?.editor;
	return editor !== undefined && editor.version === "2" ? editor : undefined;
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
 * member maps 1:1. Spec keys with no entry here (`zIndex`,
 * `textTransform`, …) are not grantable and always drop at the
 * allowlist.
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
 * {@link readEditorMetadataV2} first.
 */
export function resolveStyleTargets(
	config: Config,
	type: string,
): readonly ResolvedStyleTarget[] {
	const editor = readEditorMetadataV2(config, type);
	if (editor === undefined) return [];
	const targets: ResolvedStyleTarget[] = [];
	for (const [id, capability] of Object.entries(editor.styleTargets ?? {})) {
		const parsed = StyleTargetCapabilityV2Schema.safeParse(capability);
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
