/**
 * @file Pure target-prop resolvers for canvas drag-and-drop
 * replacement.
 *
 * Given the Puck component the user dropped onto (`item`) and the
 * active `config`, decide *which prop* the dropped text/image should
 * overwrite — or `null` when the component is not a valid target.
 *
 * Text contract (v1): mirrors the locked predicate in
 * `state/useTextSelection.ts` (`type === "Text"` with a string `text`
 * prop), and additionally accepts any component exposing a
 * string-valued prop named in {@link TEXT_PROP_CANDIDATES} whose Puck
 * field is `text`/`textarea`/`richtext`.
 *
 * Image contract (v1): an `Image` component → `"src"` (matches
 * `image/infer-asset-kind.ts#kindToPropsForInsert`). Otherwise the
 * first prop named in {@link IMAGE_PROP_CANDIDATES} that exists on the
 * component and (when a field is registered for it) resolves to an
 * image-ish field. This is an intentional, documented heuristic so
 * background/cover images on arbitrary components can be replaced
 * without a per-component contract.
 *
 * Both functions are pure and never throw — config/field shapes are
 * read defensively because host configs may omit field metadata or use
 * custom fields.
 */

import type { ComponentData, Config } from "@puckeditor/core";

const TEXT_PROP_CANDIDATES = ["text", "title", "heading", "content"] as const;

const IMAGE_PROP_CANDIDATES = [
	"src",
	"image",
	"imageSrc",
	"imageUrl",
	"backgroundImage",
	"bgImage",
	"coverImage",
] as const;

const TEXT_FIELD_TYPES = new Set(["text", "textarea", "richtext"]);
const IMAGE_FIELD_TYPES = new Set(["text", "external", "custom"]);

interface FieldLike {
	readonly type?: string;
}

/**
 * Defensive read of `config.components[type].fields`. Returns an empty
 * map when any link in the chain is missing.
 */
function fieldsFor(
	config: Config,
	type: string,
): Readonly<Record<string, FieldLike>> {
	const components = (
		config as {
			components?: Record<string, { fields?: Record<string, FieldLike> }>;
		}
	).components;
	return components?.[type]?.fields ?? {};
}

function isStringProp(value: unknown): value is string {
	return typeof value === "string";
}

/**
 * Resolve the prop a dropped text snippet should overwrite, or `null`
 * when `item` is not a compatible text target.
 */
export function resolveTextTargetProp(
	item: ComponentData | null | undefined,
	config: Config,
): string | null {
	if (item === null || item === undefined) return null;
	const props = item.props as Record<string, unknown>;

	// Locked v1 predicate — no field metadata required.
	if (item.type === "Text" && isStringProp(props["text"])) {
		return "text";
	}

	const fields = fieldsFor(config, item.type);
	for (const candidate of TEXT_PROP_CANDIDATES) {
		if (!isStringProp(props[candidate])) continue;
		const fieldType = fields[candidate]?.type;
		if (fieldType !== undefined && TEXT_FIELD_TYPES.has(fieldType)) {
			return candidate;
		}
	}
	return null;
}

/**
 * Resolve the prop a dropped image asset should overwrite, or `null`
 * when `item` is not a compatible image target.
 */
export function resolveImageTargetProp(
	item: ComponentData | null | undefined,
	config: Config,
): string | null {
	if (item === null || item === undefined) return null;
	const props = item.props as Record<string, unknown>;

	// Canonical Image component — matches the sidebar's insert contract.
	if (item.type === "Image") return "src";

	const fields = fieldsFor(config, item.type);
	for (const candidate of IMAGE_PROP_CANDIDATES) {
		if (!Object.hasOwn(props, candidate)) continue;
		const value = props[candidate];
		// An image URL prop is either an existing string or unset.
		if (value !== undefined && typeof value !== "string") continue;
		const fieldType = fields[candidate]?.type;
		// When a field is registered it must look like an image picker;
		// when none is registered the candidate name (already an
		// image-named allowlist entry) is sufficient.
		if (fieldType === undefined || IMAGE_FIELD_TYPES.has(fieldType)) {
			return candidate;
		}
	}
	return null;
}
