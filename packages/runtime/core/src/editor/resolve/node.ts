/**
 * @file Full style-target resolution (PLAN-0020 CORE-P0-010; DD-0019
 * §11.3, §24.3).
 *
 * Precedence, lowest to highest: component default → attached style
 * definitions in list order → target base → style-definition
 * breakpoint override → target breakpoint override. Gesture preview is
 * layered by callers (DD §11.3 layer 6). Merging is property-wise;
 * tokens resolve **after** each winning value is selected and never
 * change precedence.
 *
 * ---
 *
 * **Re-signatured by `p2-002` (PLAN-0026 §3.2).** PLAN-0025 §11.4's
 * rule governs: *reuse the algorithms, never the old data source.* The
 * cascade below is unchanged — what changed is what it reads.
 *
 * It used to take the whole `AuthoringStateV1` sidecar and index it by
 * node id. The style compiler, which has consumed this module on
 * carrier documents for some time, therefore had to **synthesize a
 * sidecar** on every compile: it projected each `TargetAppearance`
 * into a fake node record keyed `nodeId␟targetId` and wrapped the
 * whole lot in a fake `AuthoringStateV1` just to call in. That adapter
 * is deleted; the cascade now reads `TargetAppearance` directly.
 *
 * Consequently nothing in the resolve layer references the sidecar, and
 * the read model (`src/document-model/`) can reuse this maths on the
 * same shapes the inspector and compiler already hold — which is the
 * whole point of doing it before `p2-003`.
 */

import type {
	AuthorStyle,
	BreakpointDefinition,
	DesignSystem,
	EditorError,
	LayoutSpec,
	ResponsiveValue,
	StyleDefinition,
	TargetAppearance,
	TypographySpec,
	VisualStyleSpec,
} from "@anvilkit/contracts/editor";
import { makeEditorError } from "../diagnostics.js";
import { isTokenRef } from "../tokens/walk.js";
import { mergePropertyWise } from "./merge.js";
import { getMatchingBreakpoints } from "./responsive.js";
import { materializeTokenLiteral, resolveToken } from "./token.js";

/** Per-target component defaults supplied by the capability layer. */
export interface NodeComponentDefaults {
	readonly layout?: Partial<LayoutSpec>;
	readonly style?: Partial<VisualStyleSpec>;
	readonly typography?: Partial<TypographySpec>;
}

/**
 * The design-system slice resolution reads. Narrowed to the three
 * collections actually consulted, so a caller holding only a partial
 * design system need not fabricate the rest.
 */
export type ResolveDesignSystem = Pick<
	DesignSystem,
	"styleDefinitions" | "tokens" | "tokenModes"
>;

/** Everything target resolution needs, supplied by the caller. */
export interface ResolveContext {
	readonly designSystem: ResolveDesignSystem;
	readonly breakpoints: readonly BreakpointDefinition[];
	readonly viewportWidth: number;
	readonly tokenMode: string;
	/**
	 * Mode consulted when a token carries no value in `tokenMode`
	 * (§15.1 mode fallback); typically
	 * `StudioEditorConfig.defaultTokenMode`.
	 */
	readonly defaultTokenMode?: string;
	/**
	 * Defaults for **this target**. Previously a `Record<nodeId, …>`
	 * that every caller indexed with the id it had just passed in;
	 * target addressing makes the indirection pointless.
	 */
	readonly componentDefaults?: NodeComponentDefaults;
}

/** The resolved (post-token) authoring values for one node. */
export interface ResolvedNodeAuthoring {
	readonly layout: Partial<LayoutSpec>;
	readonly style: Partial<VisualStyleSpec>;
	readonly typography: Partial<TypographySpec>;
	readonly hidden: boolean;
	readonly diagnostics: readonly EditorError[];
}

type FamilyKey = "layout" | "style" | "typography";

/**
 * `StyleDefinition` names the visual family `style`; `AuthorStyle`
 * names it `visual`. Both carry a `VisualStyleSpec`, so the cascade
 * reads one key on definitions and the other on the target's authored
 * style. Keeping the mapping in one table is what stops that rename
 * turning into a silently-dropped family.
 */
const AUTHOR_FAMILY_KEY: Readonly<Record<FamilyKey, keyof AuthorStyle>> = {
	layout: "layout",
	style: "visual",
	typography: "typography",
};

function familyOf(
	definition: StyleDefinition | undefined,
	family: FamilyKey,
): ResponsiveValue<object> | undefined {
	return definition?.[family] as ResponsiveValue<object> | undefined;
}

function overrideAt(
	value: ResponsiveValue<object> | undefined,
	breakpointId: string,
): object | undefined {
	const entry = value?.overrides?.[breakpointId];
	return entry === null ? undefined : entry;
}

/**
 * One family's authored base value on a target.
 *
 * Replaces the `projectFamily` projection the style compiler used to
 * run before calling in (`style-compiler/compile.ts`): rather than
 * rebuilding a per-family `ResponsiveValue` for every target, the
 * cascade now reads the family out of the authored `AuthorStyle`
 * in place. Semantics are unchanged — an absent family and a `null`
 * layer both read as "no contribution at this layer".
 */
function authorBaseAt(
	style: ResponsiveValue<AuthorStyle> | undefined,
	family: FamilyKey,
): object | undefined {
	return style?.base?.[AUTHOR_FAMILY_KEY[family]] as object | undefined;
}

/** One family's authored override at a breakpoint, `null` = absent. */
function authorOverrideAt(
	style: ResponsiveValue<AuthorStyle> | undefined,
	family: FamilyKey,
	breakpointId: string,
): object | undefined {
	const layer = style?.overrides?.[breakpointId];
	if (layer === undefined || layer === null) {
		return undefined;
	}
	const value = layer[AUTHOR_FAMILY_KEY[family]];
	return value === undefined || value === null ? undefined : (value as object);
}

/**
 * Resolve the attached style definitions for a node at the current
 * viewport: the `styleRefs` list itself is responsive (narrowest
 * matching layer wins wholesale — reference lists replace, they do
 * not merge).
 */
function resolveStyleRefs(
	target: TargetAppearance | undefined,
	context: ResolveContext,
): {
	readonly definitions: readonly StyleDefinition[];
	readonly diagnostics: readonly EditorError[];
} {
	const refs = target?.styleRefs;
	if (refs === undefined) {
		return { definitions: [], diagnostics: [] };
	}
	let active: readonly string[] | undefined = refs.base;
	for (const breakpoint of getMatchingBreakpoints(
		context.breakpoints,
		context.viewportWidth,
	)) {
		const entry = refs.overrides?.[breakpoint.id];
		if (entry !== undefined && entry !== null) {
			active = entry;
		}
	}
	const diagnostics: EditorError[] = [];
	const definitions: StyleDefinition[] = [];
	for (const id of active ?? []) {
		const definition = context.designSystem.styleDefinitions[id];
		if (definition === undefined) {
			diagnostics.push(
				makeEditorError(
					"EDITOR_NODE_NOT_FOUND",
					`style definition "${id}" is not in this document`,
					{ details: { kind: "styleDefinition", id }, severity: "warning" },
				),
			);
			continue;
		}
		definitions.push(definition);
	}
	return { definitions, diagnostics };
}

function resolveFamily(
	family: FamilyKey,
	target: TargetAppearance | undefined,
	definitions: readonly StyleDefinition[],
	context: ResolveContext,
): object {
	const defaults = context.componentDefaults?.[family] as
		| Partial<object>
		| undefined;
	const authored = target?.style;
	const base = mergePropertyWise<object>(
		defaults,
		...definitions.map((definition) => familyOf(definition, family)?.base),
		authorBaseAt(authored, family),
	);
	return getMatchingBreakpoints(
		context.breakpoints,
		context.viewportWidth,
	).reduce(
		(current, breakpoint) =>
			mergePropertyWise(
				current,
				...definitions.map((definition) =>
					overrideAt(familyOf(definition, family), breakpoint.id),
				),
				authorOverrideAt(authored, family, breakpoint.id),
			),
		base,
	);
}

/**
 * The slice of {@link ResolveContext} token substitution actually
 * reads. Narrow on purpose so callers that have no viewport — the live
 * authoring stylesheet emits per-layer deltas, not an effective value
 * for one width — can substitute without inventing a `viewportWidth`.
 */
export interface TokenSubstitutionContext {
	readonly designSystem: Pick<DesignSystem, "tokens" | "tokenModes">;
	readonly tokenMode: string;
	/** §15.1 mode fallback; typically `StudioEditorConfig.defaultTokenMode`. */
	readonly defaultTokenMode?: string;
}

/**
 * Substitute token references with resolved literals across a
 * resolved spec tree. Unresolvable references keep the reference in
 * place (renderers fall back per §25) and add a diagnostic.
 */
export function substituteTokens(
	value: unknown,
	context: TokenSubstitutionContext,
	diagnostics: EditorError[],
): unknown {
	if (Array.isArray(value)) {
		return value.map((entry) => substituteTokens(entry, context, diagnostics));
	}
	if (typeof value !== "object" || value === null) {
		return value;
	}
	if (isTokenRef(value)) {
		const resolution = resolveToken(
			value.tokenId,
			context.tokenMode,
			context.designSystem.tokens,
			context.designSystem.tokenModes,
			{ defaultModeId: context.defaultTokenMode },
		);
		if (resolution.status === "resolved") {
			return materializeTokenLiteral(resolution.type, resolution.value);
		}
		if (resolution.status === "cycle") {
			diagnostics.push(
				makeEditorError(
					"EDITOR_TOKEN_CYCLE",
					`token alias cycle at "${value.tokenId}"`,
					{ details: { path: resolution.path }, severity: "warning" },
				),
			);
			return value;
		}
		diagnostics.push(
			resolution.status === "type-mismatch"
				? makeEditorError(
						"EDITOR_INVALID_CSS_VALUE",
						`token "${resolution.tokenId}" aliases "${resolution.aliasTokenId}" of incompatible type "${resolution.actual}" (expected "${resolution.expected}")`,
						{
							details: {
								kind: "token",
								reason: "token-type-mismatch",
								tokenId: resolution.tokenId,
								aliasTokenId: resolution.aliasTokenId,
								expected: resolution.expected,
								actual: resolution.actual,
							},
							severity: "warning",
						},
					)
				: makeEditorError(
						"EDITOR_NODE_NOT_FOUND",
						`token "${value.tokenId}" cannot be resolved`,
						{
							details: { kind: "token", status: resolution.status },
							severity: "warning",
						},
					),
		);
		return value;
	}
	const next: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(value)) {
		next[key] = substituteTokens(entry, context, diagnostics);
	}
	return next;
}

/**
 * Resolve everything the preview, canvas and export pipelines need for
 * one **style target** (DD-0019 §24.3 — cascade order unchanged).
 *
 * Renamed from `resolveNodeAuthoring` by `p2-002`. The old name became
 * actively misleading once the input became a `TargetAppearance`: a
 * node has many targets, and a node-addressed name is exactly the
 * confusion report 0021 recorded when node-addressed reads stranded
 * per-target state. Addressing here now matches
 * `puck/read-appearance.ts`'s `TargetReadInput` and `p2-003`'s field
 * reads by construction.
 */
export function resolveTargetAppearance(
	target: TargetAppearance | undefined,
	context: ResolveContext,
): ResolvedNodeAuthoring {
	const { definitions, diagnostics: refDiagnostics } = resolveStyleRefs(
		target,
		context,
	);
	const diagnostics: EditorError[] = [...refDiagnostics];

	const layout = substituteTokens(
		resolveFamily("layout", target, definitions, context),
		context,
		diagnostics,
	) as Partial<LayoutSpec>;
	const style = substituteTokens(
		resolveFamily("style", target, definitions, context),
		context,
		diagnostics,
	) as Partial<VisualStyleSpec>;
	const typography = substituteTokens(
		resolveFamily("typography", target, definitions, context),
		context,
		diagnostics,
	) as Partial<TypographySpec>;

	let hidden = target?.hidden?.base === true;
	for (const breakpoint of getMatchingBreakpoints(
		context.breakpoints,
		context.viewportWidth,
	)) {
		const entry = target?.hidden?.overrides?.[breakpoint.id];
		if (entry !== undefined && entry !== null) {
			hidden = entry;
		}
	}

	return { layout, style, typography, hidden, diagnostics };
}
