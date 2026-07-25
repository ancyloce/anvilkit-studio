/**
 * @file Full node authoring resolution (PLAN-0020 CORE-P0-010;
 * DD-0019 §11.3, §24.3).
 *
 * Precedence, lowest to highest: component default → attached style
 * definitions in list order → node base → style-definition
 * breakpoint override → node breakpoint override. Gesture preview is
 * layered by callers (DD §11.3 layer 6). Merging is property-wise;
 * tokens resolve **after** each winning value is selected and never
 * change precedence.
 */

import type {
	AuthoringStateV1,
	BreakpointDefinition,
	EditorError,
	LayoutSpec,
	NodeAuthoringStateV1,
	ResponsiveValue,
	StyleDefinitionV1,
	TypographySpec,
	VisualStyleSpec,
} from "@anvilkit/contracts/editor";
import { makeEditorError } from "../diagnostics.js";
import { isTokenRef } from "../tokens/walk.js";
import { mergePropertyWise } from "./merge.js";
import { getMatchingBreakpoints } from "./responsive.js";
import { materializeTokenLiteral, resolveToken } from "./token.js";

/** Per-node component defaults supplied by the capability layer. */
export interface NodeComponentDefaults {
	readonly layout?: Partial<LayoutSpec>;
	readonly style?: Partial<VisualStyleSpec>;
	readonly typography?: Partial<TypographySpec>;
}

/** Everything node resolution needs, supplied by the caller. */
export interface ResolveContext {
	readonly authoring: AuthoringStateV1;
	readonly breakpoints: readonly BreakpointDefinition[];
	readonly viewportWidth: number;
	readonly tokenMode: string;
	/**
	 * Mode consulted when a token carries no value in `tokenMode`
	 * (§15.1 mode fallback); typically
	 * `StudioEditorConfig.defaultTokenMode`.
	 */
	readonly defaultTokenMode?: string;
	readonly componentDefaults?: Readonly<Record<string, NodeComponentDefaults>>;
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

function familyOf(
	definition: StyleDefinitionV1 | undefined,
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
 * Resolve the attached style definitions for a node at the current
 * viewport: the `styleRefs` list itself is responsive (narrowest
 * matching layer wins wholesale — reference lists replace, they do
 * not merge).
 */
function resolveStyleRefs(
	node: NodeAuthoringStateV1 | undefined,
	context: ResolveContext,
): {
	readonly definitions: readonly StyleDefinitionV1[];
	readonly diagnostics: readonly EditorError[];
} {
	const refs = node?.styleRefs;
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
	const definitions: StyleDefinitionV1[] = [];
	for (const id of active ?? []) {
		const definition = context.authoring.styleDefinitions[id];
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
	node: NodeAuthoringStateV1 | undefined,
	definitions: readonly StyleDefinitionV1[],
	context: ResolveContext,
	nodeId: string,
): object {
	const defaults = context.componentDefaults?.[nodeId]?.[family] as
		| Partial<object>
		| undefined;
	const nodeFamily = node?.[family] as ResponsiveValue<object> | undefined;
	const base = mergePropertyWise<object>(
		defaults,
		...definitions.map((definition) => familyOf(definition, family)?.base),
		nodeFamily?.base,
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
				overrideAt(nodeFamily, breakpoint.id),
			),
		base,
	);
}

/**
 * Substitute token references with resolved literals across a
 * resolved spec tree. Unresolvable references keep the reference in
 * place (renderers fall back per §25) and add a diagnostic.
 */
function substituteTokens(
	value: unknown,
	context: ResolveContext,
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
			context.authoring.tokens,
			context.authoring.tokenModes,
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
 * Resolve everything the preview and export pipelines need for one
 * node (DD-0019 §24.3, verbatim structure).
 */
export function resolveNodeAuthoring(
	nodeId: string,
	context: ResolveContext,
): ResolvedNodeAuthoring {
	const node = context.authoring.nodes[nodeId];
	const { definitions, diagnostics: refDiagnostics } = resolveStyleRefs(
		node,
		context,
	);
	const diagnostics: EditorError[] = [...refDiagnostics];

	const layout = substituteTokens(
		resolveFamily("layout", node, definitions, context, nodeId),
		context,
		diagnostics,
	) as Partial<LayoutSpec>;
	const style = substituteTokens(
		resolveFamily("style", node, definitions, context, nodeId),
		context,
		diagnostics,
	) as Partial<VisualStyleSpec>;
	const typography = substituteTokens(
		resolveFamily("typography", node, definitions, context, nodeId),
		context,
		diagnostics,
	) as Partial<TypographySpec>;

	let hidden = node?.hidden?.base === true;
	for (const breakpoint of getMatchingBreakpoints(
		context.breakpoints,
		context.viewportWidth,
	)) {
		const entry = node?.hidden?.overrides?.[breakpoint.id];
		if (entry !== undefined && entry !== null) {
			hidden = entry;
		}
	}

	return { layout, style, typography, hidden, diagnostics };
}
