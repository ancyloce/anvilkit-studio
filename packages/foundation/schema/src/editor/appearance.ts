/**
 * @file PLAN-0025 P1-01 — v2 appearance/design-system/metadata
 * validation and canonicalization.
 *
 * Composes the existing family schemas (specs, responsive values,
 * tokens, style definitions, component definitions) into the v2
 * carriers. Loose objects throughout, matching the repo's
 * hostile-peer + forward-compat convention.
 *
 * Canonicalization: an appearance with no effective content collapses
 * to `undefined` (plan §5.1) so empty shells are never persisted on
 * nodes.
 */

import type {
	AnvilAppearance,
	AnvilComponentMetadata,
	AuthorableStyleProperty,
	AuthorStyle,
	DesignSystem,
	DocumentComponentLibrary,
	EditorAnnotation,
	EditorAnnotations,
	TargetAppearance,
} from "@anvilkit/contracts/editor";
import { z } from "zod";
import { ComponentDefinitionCollectionSchema } from "./components.js";
import { LayoutSpecSchema } from "./layout.js";
import { IdSchema, responsiveValueSchema } from "./primitives.js";
import { BreakpointSetSchema } from "./responsive.js";
import { VisualStyleSpecSchema } from "./style.js";
import { StyleDefinitionCollectionSchema } from "./style-definitions.js";
import { TokenCollectionSchema, TokenModeSchema } from "./tokens.js";
import { TypographySpecSchema } from "./typography.js";

export const AuthorStyleSchema: z.ZodType<AuthorStyle> = z.looseObject({
	layout: LayoutSpecSchema.optional(),
	visual: VisualStyleSpecSchema.optional(),
	typography: TypographySpecSchema.optional(),
});

export const TargetAppearanceSchema: z.ZodType<TargetAppearance> =
	z.looseObject({
		styleRefs: responsiveValueSchema(z.array(IdSchema)).optional(),
		style: responsiveValueSchema(AuthorStyleSchema).optional(),
		hidden: responsiveValueSchema(z.boolean()).optional(),
	});

export const AnvilAppearanceSchema: z.ZodType<AnvilAppearance> =
	z.looseObject({
		targets: z.record(IdSchema, TargetAppearanceSchema).optional(),
	});

export const DesignSystemSchema: z.ZodType<DesignSystem> = z.looseObject({
	breakpoints: BreakpointSetSchema,
	tokens: TokenCollectionSchema,
	tokenModes: z.record(IdSchema, TokenModeSchema),
	defaultTokenMode: IdSchema,
	styleDefinitions: StyleDefinitionCollectionSchema,
});

/**
 * Editor annotations (PLAN-0026 §3.6). The per-entry object is
 * `strictObject` **on purpose** — unlike every other schema in this
 * directory, which is `looseObject` for forward compatibility. An
 * unknown key inside an annotation entry is a validation error,
 * because tolerating one is how this closed map would grow back into
 * a sidecar.
 */
export const EditorAnnotationSchema: z.ZodType<EditorAnnotation> =
	z.strictObject({
		name: z.string().optional(),
		locked: z.boolean().optional(),
	});

export const EditorAnnotationsSchema: z.ZodType<EditorAnnotations> = z.record(
	IdSchema,
	EditorAnnotationSchema,
);

/** Validate an annotations map; `undefined` when it is not valid. */
export function safeParseEditorAnnotations(value: unknown) {
	return EditorAnnotationsSchema.safeParse(value);
}

export const DocumentComponentLibrarySchema: z.ZodType<DocumentComponentLibrary> =
	z.looseObject({
		definitions: ComponentDefinitionCollectionSchema,
	});

/** Mirrors `AuthorableStyleProperty` — extending it is a gated schema change. */
export const AuthorableStylePropertySchema: z.ZodType<AuthorableStyleProperty> =
	z.enum([
		"display",
		"position",
		"width",
		"minWidth",
		"maxWidth",
		"height",
		"margin",
		"padding",
		"gap",
		"alignItems",
		"justifyContent",
		"background",
		"border",
		"borderRadius",
		"boxShadow",
		"opacity",
		"color",
		"fontFamily",
		"fontSize",
		"fontWeight",
		"lineHeight",
		"letterSpacing",
		"textAlign",
		"direction",
		"wrap",
		"rowGap",
		"columnGap",
		"columns",
		"rows",
		"minHeight",
		"maxHeight",
		"inset",
		"overflow",
		"zIndex",
		"filter",
		"blendMode",
		"cursor",
		"textDecoration",
		"textTransform",
		"textWrap",
	]);

export const StyleTargetCapabilitySchema = z.looseObject({
	label: z.string().min(1),
	properties: z.array(AuthorableStylePropertySchema),
	responsive: z.boolean().optional(),
});

const InlineTextTargetSchema = z.looseObject({
	id: IdSchema,
	propPath: z.string().min(1),
	format: z.enum(["plain", "tiptap"]),
});

const ImageTargetSchema = z.looseObject({
	id: IdSchema,
	srcPropPath: z.string().min(1),
	altPropPath: z.string().min(1).optional(),
	cropPropPath: z.string().min(1).optional(),
});

const SlotCapabilitySchema = z.looseObject({
	allowedTypes: z.array(z.string().min(1)).optional(),
	reorder: z.boolean().optional(),
	layoutContainer: z.boolean().optional(),
});

export const ComponentMetadataSchema: z.ZodType<AnvilComponentMetadata> =
	z.looseObject({
		styleTargets: z.record(IdSchema, StyleTargetCapabilitySchema),
		inlineText: z.array(InlineTextTargetSchema).optional(),
		images: z.array(ImageTargetSchema).optional(),
		slots: z.record(IdSchema, SlotCapabilitySchema).optional(),
		interactions: z.boolean().optional(),
		bindings: z.boolean().optional(),
	});

function responsiveHasContent(value: {
	readonly base?: unknown;
	readonly overrides?: Readonly<Record<string, unknown>>;
}): boolean {
	if (value.base !== undefined) return true;
	return Object.keys(value.overrides ?? {}).length > 0;
}

function targetHasContent(target: TargetAppearance): boolean {
	if (target.styleRefs !== undefined && responsiveHasContent(target.styleRefs))
		return true;
	if (target.style !== undefined && responsiveHasContent(target.style))
		return true;
	if (target.hidden !== undefined && responsiveHasContent(target.hidden))
		return true;
	return false;
}

/**
 * Canonicalize an appearance: drop content-free targets, and collapse
 * a content-free appearance to `undefined`. Never mutates its input.
 */
export function canonicalizeAppearance(
	appearance: AnvilAppearance | undefined,
): AnvilAppearance | undefined {
	if (appearance === undefined) return undefined;
	const kept: Record<string, TargetAppearance> = {};
	for (const [id, target] of Object.entries(appearance.targets ?? {})) {
		if (targetHasContent(target)) kept[id] = target;
	}
	if (Object.keys(kept).length === 0) return undefined;
	return { targets: kept };
}

export function safeParseAppearance(value: unknown) {
	return AnvilAppearanceSchema.safeParse(value);
}

export function safeParseDesignSystem(value: unknown) {
	return DesignSystemSchema.safeParse(value);
}
