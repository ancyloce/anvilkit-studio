"use client";

/**
 * @file Authoring stylesheet emission (PLAN-0020 CORE-P1A-009;
 * ED-RESP-004/005; DD-0019 §12.4, §11.4).
 *
 * @deprecated PLAN-0025 P4-07 — the LEGACY live resolver. It serves
 * only v1 sidecar documents; v2 documents style the canvas through
 * the unified compiler (`compileDocumentAppearance`) via
 * `CompiledAppearanceMount`/`PuckIframeAppearanceBridge`. Scheduled
 * for deletion with the sidecar runtime after the Phase 5 migration
 * (plan §11.3); add no new call sites.
 *
 * One scoped stylesheet per iframe over `[data-ak-node]` selectors,
 * built exclusively through the shared serializer
 * (`resolveAuthoringStyle` — never raw CSS text, never
 * `!important`). Determinism (§12.4 exact shape):
 *
 * - base rules first, then one `@media (max-width: …px)` block per
 *   enabled breakpoint in **descending** max-width order (desktop-
 *   first cascade: narrower blocks come later and win);
 * - within a layer, rules order by node id; properties serialize in
 *   the serializer's fixed application order;
 * - `hidden` compiles to `display:none` without touching
 *   `layout.display`;
 * - each media block contains only that breakpoint's override deltas —
 *   inheritance flows through the CSS cascade, mirroring §12.3.
 *
 * Incremental updates ride the engine's reference-preservation
 * invariant: per-node CSS fragments are cached by node-record
 * **reference**, so an unchanged record costs a map lookup and only
 * nodes in the change set re-serialize.
 */

import type {
	BreakpointDefinition,
	EditorError,
	EditorStyleAdapter,
	NodeAuthoringStateV1,
	ResponsiveValue,
} from "@anvilkit/contracts/editor";
import type {
	AuthoringStateV1,
} from "../../../editor/legacy/index.js";
import {
	resolveAuthoringStyle,
	substituteTokens,
	type TokenSubstitutionContext,
} from "../../../editor/index.js";

/** The id of the injected `<style>` element. */
export const AUTHORING_STYLE_ELEMENT_ID = "ak-authoring-styles";

/** Token mode context for substitution; see {@link buildAuthoringStylesheet}. */
type TokenSubstitution = TokenSubstitutionContext;

/** Per-document token options a host can influence (§15.1 modes). */
export interface AuthoringStylesheetTokenOptions {
	/** Active token mode. Defaults to `"default"`, as the exporter does. */
	readonly tokenMode?: string;
	/** Mode consulted when a token carries no value in `tokenMode`. */
	readonly defaultTokenMode?: string;
}

type FamilyKey = "layout" | "style" | "typography";

function layerSpec(
	record: NodeAuthoringStateV1,
	family: FamilyKey,
	layer: "base" | string,
): object | undefined {
	const value = record[family] as ResponsiveValue<object> | undefined;
	if (value === undefined) {
		return undefined;
	}
	if (layer === "base") {
		return value.base;
	}
	const override = value.overrides?.[layer];
	return override === null ? undefined : override;
}

function layerHidden(
	record: NodeAuthoringStateV1,
	layer: "base" | string,
): boolean | undefined {
	const value = record.hidden;
	if (value === undefined) {
		return undefined;
	}
	if (layer === "base") {
		return value.base;
	}
	const override = value.overrides?.[layer];
	return override === null ? undefined : override;
}

/**
 * Serialize one node's rule body at one layer ("" when empty).
 *
 * Token references are substituted FIRST. `resolveAuthoringStyle` is a
 * pure serializer with no token awareness — hand it a
 * `{kind:"token"}` value and it emits nothing for that property. The
 * export pipeline always ran `resolveNodeAuthoring` (which substitutes)
 * before serializing; this live path did not, so a token-backed value
 * exported correctly but vanished from the canvas. Substituting per
 * layer, rather than resolving an effective value for one viewport,
 * keeps the per-layer delta emission this file depends on.
 */
function nodeLayerCss(
	nodeId: string,
	record: NodeAuthoringStateV1,
	layer: "base" | string,
	tokens: TokenSubstitution,
): string {
	// Diagnostics are collected and dropped: unresolvable references
	// keep the reference in place (§25 renderer fallback), and this
	// builder has no channel to surface warnings on. The diagnostics
	// centre already reports them from the resolve path.
	const diagnostics: EditorError[] = [];
	const substitute = <T>(spec: T): T =>
		spec === undefined
			? spec
			: (substituteTokens(spec, tokens, diagnostics) as T);
	const resolved = resolveAuthoringStyle({
		nodeId,
		layout: substitute(layerSpec(record, "layout", layer)),
		style: substitute(layerSpec(record, "style", layer)),
		typography: substitute(layerSpec(record, "typography", layer)),
		hidden: layerHidden(record, layer) === true,
	});
	const entries = Object.entries(resolved.inlineStyle);
	if (entries.length === 0) {
		return "";
	}
	const body = entries
		.map(([property, value]) => `${property}: ${String(value)};`)
		.join(" ");
	return `[data-ak-node="${cssEscape(nodeId)}"] { ${body} }`;
}

/** Minimal attribute-value escape (quotes and backslashes). */
function cssEscape(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

interface NodeFragments {
	readonly record: NodeAuthoringStateV1;
	/**
	 * The token table the fragments were serialized against.
	 *
	 * Reference-keying on the node record ALONE was the second half of
	 * the token bug: editing a token's value changes
	 * `authoring.tokens`, never a node record, so every cached fragment
	 * stayed valid and the canvas kept painting the old resolved
	 * literal. The engine preserves references, so this compare is O(1)
	 * and still lets an unrelated commit reuse every fragment.
	 */
	readonly tokens: unknown;
	/** Layer key ("base" or breakpoint id) → serialized rule ("" = none). */
	readonly byLayer: ReadonlyMap<string, string>;
}

/** Reference-keyed per-node fragment cache. */
export type AuthoringStylesheetCache = Map<string, NodeFragments>;

/** Create an empty fragment cache (one per iframe binding). */
export function createStylesheetCache(): AuthoringStylesheetCache {
	return new Map();
}

/**
 * Mutable hit/miss counters for the fragment cache. Optional and
 * dev-only (CORE-P4-002): the §28 overlay reports the resolver cache
 * hit rate, and the cheapest honest way to know it is to count at the
 * lookup rather than infer it from timings.
 */
export interface AuthoringStylesheetCacheStats {
	hits: number;
	misses: number;
}

/**
 * Build the deterministic stylesheet text for a document, reusing
 * cached per-node fragments for records whose reference is unchanged.
 */
export function buildAuthoringStylesheet(
	authoring: AuthoringStateV1,
	breakpoints: readonly BreakpointDefinition[],
	cache?: AuthoringStylesheetCache,
	stats?: AuthoringStylesheetCacheStats,
	tokenOptions?: AuthoringStylesheetTokenOptions,
): string {
	const enabled = [...breakpoints]
		.filter((breakpoint) => breakpoint.enabled)
		.sort((a, b) => b.maxWidth - a.maxWidth);
	const layers: readonly string[] = [
		"base",
		...enabled.map((breakpoint) => breakpoint.id),
	];
	const nodeIds = Object.keys(authoring.nodes).sort();
	// `"default"` matches `buildExportStylesheet`, so the canvas and the
	// exported page resolve a token the same way.
	const tokens: TokenSubstitution = {
		authoring,
		tokenMode: tokenOptions?.tokenMode ?? "default",
		...(tokenOptions?.defaultTokenMode !== undefined
			? { defaultTokenMode: tokenOptions.defaultTokenMode }
			: {}),
	};

	const fragmentsFor = (nodeId: string): NodeFragments => {
		const record = authoring.nodes[nodeId] as NodeAuthoringStateV1;
		const cached = cache?.get(nodeId);
		if (
			cached !== undefined &&
			cached.record === record &&
			cached.tokens === authoring.tokens
		) {
			if (stats !== undefined) {
				stats.hits += 1;
			}
			return cached;
		}
		if (stats !== undefined) {
			stats.misses += 1;
		}
		const byLayer = new Map<string, string>();
		for (const layer of layers) {
			byLayer.set(layer, nodeLayerCss(nodeId, record, layer, tokens));
		}
		const fragments: NodeFragments = {
			record,
			tokens: authoring.tokens,
			byLayer,
		};
		cache?.set(nodeId, fragments);
		return fragments;
	};

	// Drop cache entries for removed nodes.
	if (cache !== undefined) {
		const live = new Set(nodeIds);
		for (const key of cache.keys()) {
			if (!live.has(key)) {
				cache.delete(key);
			}
		}
	}

	const parts: string[] = [];
	const baseRules = nodeIds
		.map((nodeId) => fragmentsFor(nodeId).byLayer.get("base") ?? "")
		.filter((rule) => rule !== "");
	parts.push(...baseRules);

	for (const breakpoint of enabled) {
		const rules = nodeIds
			.map((nodeId) => fragmentsFor(nodeId).byLayer.get(breakpoint.id) ?? "")
			.filter((rule) => rule !== "");
		if (rules.length === 0) {
			continue;
		}
		parts.push(
			`@media (max-width: ${breakpoint.maxWidth}px) { ${rules.join(" ")} }`,
		);
	}
	return parts.join("\n");
}

/**
 * Write the stylesheet into an iframe document, creating the scoped
 * `<style>` element on first use. Returns the element, or `null` when
 * a host adapter took over injection (CORE-P4-004).
 *
 * §29 lets a strict-CSP host supply either a nonce or a
 * constructable-stylesheet adapter for authoring styles. Both land
 * here because this is the single channel every authoring style
 * reaches the canvas through — see `AuthoringStylesheet.tsx`.
 */
export function applyAuthoringStylesheet(
	iframeDoc: Document,
	cssText: string,
	adapter?: EditorStyleAdapter,
): HTMLStyleElement | null {
	// Full takeover: the host owns injection (typically
	// `adoptedStyleSheets`, which needs no `style-src` allowance at
	// all), so Core must NOT also create an element — that would be the
	// very inline `<style>` the adapter exists to avoid.
	if (adapter?.adopt !== undefined) {
		adapter.adopt(iframeDoc, cssText);
		return null;
	}
	let element = iframeDoc.getElementById(
		AUTHORING_STYLE_ELEMENT_ID,
	) as HTMLStyleElement | null;
	if (element === null) {
		element = iframeDoc.createElement("style");
		element.id = AUTHORING_STYLE_ELEMENT_ID;
		if (adapter?.nonce !== undefined) {
			// Both forms on purpose: `nonce` is the property the browser
			// actually checks (the attribute is hidden after parse), while
			// the attribute keeps the element inspectable in devtools.
			element.nonce = adapter.nonce;
			element.setAttribute("nonce", adapter.nonce);
		}
		iframeDoc.head.appendChild(element);
	}
	if (element.textContent !== cssText) {
		element.textContent = cssText;
	}
	return element;
}
