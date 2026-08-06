/**
 * @file v2 appearance prop reads (PLAN-0025 P2-03) — pure, React-free
 * projections of Puck Data into the Inspector's field states: single
 * and multi-selection, breakpoint layers, mixed state, and §12.3-style
 * provenance. The algorithm mirrors the proven sidecar field-state
 * computation (`react/editor/inspector/field-state.ts`, deleted with
 * the v1 runtime in Phase 6) but reads ONLY declared component props
 * via official `walkTree` traversal — no sidecar, no DOM, no React.
 *
 * Capability filtering happens here, from the same shared metadata
 * reader the compiler enforces (§6.1): a node whose component does not
 * grant the property simply does not participate, and a selection with
 * no capable node reads as `unsupported` — the panel never fabricates
 * support (§8.5).
 */

import type {
	AnvilAppearanceV1,
	AuthorableStyleProperty,
	BreakpointDefinition,
	ResolvedValue,
	ResponsiveLayerRef,
	ResponsiveValue,
	TargetAppearanceV1,
} from "@anvilkit/contracts/editor";
import {
	safeParseAppearance,
	safeParseDesignSystem,
} from "@anvilkit/schema/editor";
import type { Config, Data } from "@puckeditor/core";
import { walkTree } from "@puckeditor/core";
import { deepEqualJson } from "../editor/patch.js";
import { resolveResponsiveValue } from "../editor/resolve/responsive.js";
import {
	AUTHORABLE_PROPERTY_LOCATIONS,
	resolveStyleTargets,
} from "./component-metadata.js";

/** One collected node: type + tolerantly parsed appearance. */
export interface AppearanceNode {
	readonly nodeId: string;
	readonly type: string;
	readonly appearance: AnvilAppearanceV1 | undefined;
}

/**
 * One field's computed state across the selection — the v2 successor
 * of the sidecar `InspectorFieldState` union, same four members:
 * `value` (all capable nodes agree; provenance carried), `mixed`,
 * `unset` (nothing anywhere in the cascade; resolved fallback for
 * placeholders), `unsupported` (no capable node). `invalid` stays a
 * transient control state by design and is never produced here.
 */
export type AppearanceReadState<T> =
	| {
			readonly kind: "value";
			readonly value: T;
			readonly resolved: ResolvedValue<T>;
			/** True when the value is written at the active layer. */
			readonly writtenAtLayer: boolean;
	  }
	| { readonly kind: "mixed" }
	| { readonly kind: "unset"; readonly resolved: ResolvedValue<T> }
	| { readonly kind: "unsupported" };

/**
 * Collect every node in the document — content, slots, legacy zones —
 * through official `walkTree` traversal. Callers (panels) memoize this
 * per Data reference; the read functions below take the map so a
 * 23-property render pays one traversal, not 23.
 */
export function collectAppearanceNodes(
	data: Data,
	config: Config,
): ReadonlyMap<string, AppearanceNode> {
	const nodes = new Map<string, AppearanceNode>();
	walkTree(data, config, (content) => {
		for (const item of content) {
			const props = item.props as {
				id?: unknown;
				appearance?: unknown;
			};
			const nodeId = typeof props.id === "string" ? props.id : undefined;
			if (nodeId === undefined) continue;
			let appearance: AnvilAppearanceV1 | undefined;
			if (props.appearance !== undefined) {
				const parsed = safeParseAppearance(props.appearance);
				appearance = parsed.success ? parsed.data : undefined;
			}
			nodes.set(nodeId, { nodeId, type: item.type as string, appearance });
		}
		return content;
	});
	return nodes;
}

/** The document's validated breakpoints (empty when absent/invalid). */
export function documentBreakpoints(
	data: Data,
): readonly BreakpointDefinition[] {
	const raw = (data.root?.props as { designSystem?: unknown } | undefined)
		?.designSystem;
	if (raw === undefined) return [];
	const parsed = safeParseDesignSystem(raw);
	return parsed.success ? parsed.data.breakpoints : [];
}

/** Shared input of every read function. */
export interface TargetReadInput {
	/** From {@link collectAppearanceNodes} (caller-memoized). */
	readonly nodes: ReadonlyMap<string, AppearanceNode>;
	readonly config: Config;
	readonly breakpoints: readonly BreakpointDefinition[];
	/** The selection; unknown ids and incapable nodes drop out. */
	readonly nodeIds: readonly string[];
	readonly targetId: string;
	/** The active write layer (`"base"` or a breakpoint id). */
	readonly layer: ResponsiveLayerRef;
	/** Provenance viewport; defaults from `layer` (base = widest). */
	readonly viewportWidth?: number;
}

/** Base-layer provenance width (mirrors the compiler's base layer). */
const BASE_LAYER_WIDTH = Number.MAX_SAFE_INTEGER;

function effectiveViewportWidth(input: TargetReadInput): number {
	if (input.viewportWidth !== undefined) return input.viewportWidth;
	if (input.layer === "base") return BASE_LAYER_WIDTH;
	const breakpoint = input.breakpoints.find(
		(entry) => entry.id === input.layer,
	);
	return breakpoint?.maxWidth ?? BASE_LAYER_WIDTH;
}

/** The value written at exactly `layer` (`null` reads as cleared). */
function writtenAt<T>(
	value: ResponsiveValue<T> | undefined,
	layer: ResponsiveLayerRef,
): T | undefined {
	if (value === undefined) return undefined;
	if (layer === "base") return value.base;
	const entry = value.overrides?.[layer];
	return entry === null ? undefined : entry;
}

/**
 * The shared four-state computation over per-node projections —
 * exactly the sidecar algorithm: disagree at the layer → `mixed`;
 * agree on a written value → `value` (written); nothing written but
 * effective values agree → `value` (inherited) or `unset`.
 */
function readLayered<T>(
	projections: readonly (ResponsiveValue<T> | undefined)[],
	input: TargetReadInput,
): AppearanceReadState<T> {
	if (projections.length === 0) return { kind: "unsupported" };
	const viewportWidth = effectiveViewportWidth(input);
	const layerValues = projections.map((projection) =>
		writtenAt(projection, input.layer),
	);
	const resolutions = projections.map((projection) =>
		resolveResponsiveValue<T>(
			projection,
			input.breakpoints,
			viewportWidth,
			(_base, override) => override,
		),
	);

	const first = layerValues[0];
	if (!layerValues.every((value) => deepEqualJson(value, first))) {
		return { kind: "mixed" };
	}
	if (first !== undefined) {
		return {
			kind: "value",
			value: first,
			resolved: resolutions[0] as ResolvedValue<T>,
			writtenAtLayer: true,
		};
	}
	const firstResolved = resolutions[0] as ResolvedValue<T>;
	if (
		!resolutions.every((resolution) =>
			deepEqualJson(resolution.value, firstResolved.value),
		)
	) {
		return { kind: "mixed" };
	}
	if (firstResolved.value !== undefined) {
		return {
			kind: "value",
			value: firstResolved.value,
			resolved: firstResolved,
			writtenAtLayer: false,
		};
	}
	return { kind: "unset", resolved: firstResolved };
}

/** Nodes from the selection whose component passes `capable`. */
function capableTargets(
	input: TargetReadInput,
	capable: (targetProperties: readonly AuthorableStyleProperty[]) => boolean,
): (TargetAppearanceV1 | undefined)[] {
	const capableNodes: (TargetAppearanceV1 | undefined)[] = [];
	for (const nodeId of input.nodeIds) {
		const node = input.nodes.get(nodeId);
		if (node === undefined) continue;
		const target = resolveStyleTargets(input.config, node.type).find(
			(entry) => entry.id === input.targetId,
		);
		if (target === undefined || !capable(target.properties)) continue;
		capableNodes.push(node.appearance?.targets?.[input.targetId]);
	}
	return capableNodes;
}

/** Project one §6.1 property out of a target's layered style value. */
function projectTargetProperty(
	target: TargetAppearanceV1 | undefined,
	property: AuthorableStyleProperty,
): ResponsiveValue<unknown> | undefined {
	const style = target?.style;
	if (style === undefined) return undefined;
	const location = AUTHORABLE_PROPERTY_LOCATIONS[property];
	const familyOf = (
		layer: typeof style.base,
	): Record<string, unknown> | undefined =>
		(
			layer as Record<string, Record<string, unknown> | undefined> | undefined
		)?.[location.family];
	const base = familyOf(style.base)?.[location.specKey];
	let overrides: Record<string, unknown | null> | undefined;
	for (const [breakpointId, layer] of Object.entries(style.overrides ?? {})) {
		if (layer === null) {
			// Whole layer cleared: the property clears with it.
			overrides ??= {};
			overrides[breakpointId] = null;
			continue;
		}
		const entry = familyOf(layer)?.[location.specKey];
		if (entry !== undefined) {
			overrides ??= {};
			overrides[breakpointId] = entry;
		}
	}
	if (base === undefined && overrides === undefined) return undefined;
	return {
		...(base !== undefined ? { base } : {}),
		...(overrides !== undefined ? { overrides } : {}),
	} as ResponsiveValue<unknown>;
}

/**
 * Read one granted property across the selection. Nodes whose
 * component does not grant (`targetId`, `property`) drop out; an empty
 * capable set is `unsupported`.
 */
export function readAppearanceProperty(
	input: TargetReadInput & { readonly property: AuthorableStyleProperty },
): AppearanceReadState<unknown> {
	const targets = capableTargets(input, (properties) =>
		properties.includes(input.property),
	);
	return readLayered(
		targets.map((target) => projectTargetProperty(target, input.property)),
		input,
	);
}

/** Read the target's `hidden` flag across the selection. */
export function readTargetHidden(
	input: TargetReadInput,
): AppearanceReadState<boolean> {
	const targets = capableTargets(input, () => true);
	return readLayered(
		targets.map((target) => target?.hidden),
		input,
	);
}

/** Read the target's style references across the selection. */
export function readTargetStyleRefs(
	input: TargetReadInput,
): AppearanceReadState<readonly string[]> {
	const targets = capableTargets(input, () => true);
	return readLayered(
		targets.map((target) => target?.styleRefs),
		input,
	);
}
