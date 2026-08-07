/**
 * @file The single traversal over every token reference in an
 * authoring document (PLAN-0020 CORE-P2-001; DD-0019 §15.1).
 *
 * Usage tracking (ED-TOKEN-002) and deletion rewriting (ED-TOKEN-003)
 * are the same walk with different visitors — deliberately one
 * implementation, so the impact preview the user approves and the
 * rewrite that commits can never disagree about which sites exist.
 *
 * The walk is reference-preserving: a visitor that replaces nothing
 * returns the input state by identity, which keeps the deep-equal
 * noop check in `applyEditorCommand` on its fast path.
 */

import type {
	ComponentDefinitionId,
	ComponentDefinition,
	ComponentInstanceState,
	NodeAuthoringStateV1,
	NodeOverridePatch,
	PropertyPath,
	ResponsiveLayerRef,
	ResponsiveValue,
	StyleDefinitionId,
	StyleDefinition,
	TokenModeId,
} from "@anvilkit/contracts/editor";
import type {
	AuthoringStateV1,
} from "../legacy/index.js";

/** The authoring families that can carry token references. */
export type TokenReferenceFamily = "layout" | "style" | "typography";

const TOKEN_FAMILIES: readonly TokenReferenceFamily[] = [
	"layout",
	"style",
	"typography",
];

/** One located token reference (ED-TOKEN-002 usage tracking). */
export type TokenUsageSite =
	| {
			readonly kind: "node";
			readonly nodeId: string;
			readonly family: TokenReferenceFamily;
			readonly layer: ResponsiveLayerRef;
			readonly path: PropertyPath;
	  }
	| {
			readonly kind: "styleDefinition";
			readonly styleDefinitionId: StyleDefinitionId;
			readonly family: TokenReferenceFamily;
			readonly layer: ResponsiveLayerRef;
			readonly path: PropertyPath;
	  }
	| {
			readonly kind: "instanceOverride";
			readonly nodeId: string;
			readonly definitionNodeId: string;
			readonly family: TokenReferenceFamily;
			readonly layer: ResponsiveLayerRef;
			readonly path: PropertyPath;
	  }
	| {
			readonly kind: "componentVariant";
			readonly definitionId: ComponentDefinitionId;
			readonly variantId: string;
			readonly definitionNodeId: string;
			readonly family: TokenReferenceFamily;
			readonly layer: ResponsiveLayerRef;
			readonly path: PropertyPath;
	  }
	| {
			/** Another token's alias value — the alias-graph edge (§24.5). */
			readonly kind: "tokenAlias";
			readonly tokenId: string;
			readonly modeId: TokenModeId;
	  };

/**
 * A visitor. Return a replacement node to rewrite the reference, or
 * `undefined` to leave it untouched.
 */
export type TokenRefVisitor = (
	tokenId: string,
	site: TokenUsageSite,
) => unknown;

/** True for a `{kind:"token", tokenId}` reference node (§9.3). */
export function isTokenRef(
	value: unknown,
): value is { kind: "token"; tokenId: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { kind?: unknown }).kind === "token" &&
		typeof (value as { tokenId?: unknown }).tokenId === "string"
	);
}

/**
 * Walk one spec subtree, visiting every token reference. Returns the
 * input by identity when nothing was replaced.
 */
function mapSpecTokens(
	value: unknown,
	visit: (tokenId: string, path: PropertyPath) => unknown,
	path: PropertyPath,
): unknown {
	if (Array.isArray(value)) {
		let changed = false;
		const next = value.map((entry, index) => {
			const mapped = mapSpecTokens(entry, visit, [...path, index]);
			if (mapped !== entry) {
				changed = true;
			}
			return mapped;
		});
		return changed ? next : value;
	}
	if (typeof value !== "object" || value === null) {
		return value;
	}
	if (isTokenRef(value)) {
		const replacement = visit(value.tokenId, path);
		return replacement === undefined ? value : replacement;
	}
	let changed = false;
	const next: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(value)) {
		const mapped = mapSpecTokens(entry, visit, [...path, key]);
		if (mapped !== entry) {
			changed = true;
		}
		next[key] = mapped;
	}
	return changed ? next : value;
}

/**
 * Walk a `ResponsiveValue` family, visiting base and every override
 * with its layer. Returns the input by identity when unchanged.
 */
function mapFamilyTokens<T>(
	family: ResponsiveValue<T> | undefined,
	visit: (
		tokenId: string,
		layer: ResponsiveLayerRef,
		path: PropertyPath,
	) => unknown,
): ResponsiveValue<T> | undefined {
	if (family === undefined) {
		return family;
	}
	let changed = false;
	const nextBase =
		family.base === undefined
			? family.base
			: (mapSpecTokens(
					family.base,
					(tokenId, path) => visit(tokenId, "base", path),
					[],
				) as T);
	if (nextBase !== family.base) {
		changed = true;
	}
	let nextOverrides = family.overrides;
	if (family.overrides !== undefined) {
		const rebuilt: Record<string, T | null> = {};
		let overridesChanged = false;
		for (const [layer, entry] of Object.entries(family.overrides)) {
			if (entry === null || entry === undefined) {
				rebuilt[layer] = entry as T | null;
				continue;
			}
			const mapped = mapSpecTokens(
				entry,
				(tokenId, path) => visit(tokenId, layer, path),
				[],
			) as T;
			if (mapped !== entry) {
				overridesChanged = true;
			}
			rebuilt[layer] = mapped;
		}
		if (overridesChanged) {
			nextOverrides = rebuilt;
			changed = true;
		}
	}
	if (!changed) {
		return family;
	}
	const next: ResponsiveValue<T> = {};
	if (nextBase !== undefined) {
		(next as { base?: T }).base = nextBase;
	}
	if (nextOverrides !== undefined) {
		(next as { overrides?: Record<string, T | null> }).overrides =
			nextOverrides;
	}
	return next;
}

/** Map the three token-bearing families of a container object. */
function mapFamilyContainer<T extends object>(
	container: T,
	visit: (
		family: TokenReferenceFamily,
		tokenId: string,
		layer: ResponsiveLayerRef,
		path: PropertyPath,
	) => unknown,
): T {
	let changed = false;
	const next: Record<string, unknown> = { ...(container as object) };
	for (const family of TOKEN_FAMILIES) {
		const current = (container as Record<string, unknown>)[family] as
			| ResponsiveValue<object>
			| undefined;
		const mapped = mapFamilyTokens(current, (tokenId, layer, path) =>
			visit(family, tokenId, layer, path),
		);
		if (mapped !== current) {
			changed = true;
			next[family] = mapped;
		}
	}
	return changed ? (next as T) : container;
}

function mapInstanceOverrides(
	nodeId: string,
	instance: ComponentInstanceState,
	visitor: TokenRefVisitor,
): ComponentInstanceState {
	let changed = false;
	const nextOverrides: Record<string, NodeOverridePatch> = {};
	for (const [definitionNodeId, patch] of Object.entries(
		instance.nodeOverrides,
	)) {
		const mapped = mapFamilyContainer(patch, (family, tokenId, layer, path) =>
			visitor(tokenId, {
				kind: "instanceOverride",
				nodeId,
				definitionNodeId,
				family,
				layer,
				path,
			}),
		);
		if (mapped !== patch) {
			changed = true;
		}
		nextOverrides[definitionNodeId] = mapped;
	}
	return changed ? { ...instance, nodeOverrides: nextOverrides } : instance;
}

function mapComponentDefinition(
	definition: ComponentDefinition,
	visitor: TokenRefVisitor,
): ComponentDefinition {
	let changed = false;
	const nextVariants = definition.variants.map((variant) => {
		let variantChanged = false;
		const nextPatch: Record<string, NodeOverridePatch> = {};
		for (const [definitionNodeId, patch] of Object.entries(variant.patch)) {
			const mapped = mapFamilyContainer(patch, (family, tokenId, layer, path) =>
				visitor(tokenId, {
					kind: "componentVariant",
					definitionId: definition.id,
					variantId: variant.id,
					definitionNodeId,
					family,
					layer,
					path,
				}),
			);
			if (mapped !== patch) {
				variantChanged = true;
			}
			nextPatch[definitionNodeId] = mapped;
		}
		if (!variantChanged) {
			return variant;
		}
		changed = true;
		return { ...variant, patch: nextPatch };
	});
	return changed ? { ...definition, variants: nextVariants } : definition;
}

/**
 * Visit every token reference in the document — node families,
 * attached style definitions, component-instance overrides, component
 * variant patches, and token alias edges — rewriting where the
 * visitor returns a replacement.
 *
 * Reference-preserving: returns `state` itself when nothing changed.
 */
export function mapAuthoringTokens(
	state: AuthoringStateV1,
	visitor: TokenRefVisitor,
): AuthoringStateV1 {
	let changed = false;

	const nextNodes: Record<string, NodeAuthoringStateV1> = {};
	for (const [nodeId, record] of Object.entries(state.nodes)) {
		let nextRecord = mapFamilyContainer(
			record,
			(family, tokenId, layer, path) =>
				visitor(tokenId, { kind: "node", nodeId, family, layer, path }),
		);
		if (nextRecord.componentInstance !== undefined) {
			const nextInstance = mapInstanceOverrides(
				nodeId,
				nextRecord.componentInstance,
				visitor,
			);
			if (nextInstance !== nextRecord.componentInstance) {
				nextRecord = { ...nextRecord, componentInstance: nextInstance };
			}
		}
		if (nextRecord !== record) {
			changed = true;
		}
		nextNodes[nodeId] = nextRecord;
	}

	const nextStyleDefinitions: Record<string, StyleDefinition> = {};
	for (const [id, definition] of Object.entries(state.styleDefinitions)) {
		const mapped = mapFamilyContainer(
			definition,
			(family, tokenId, layer, path) =>
				visitor(tokenId, {
					kind: "styleDefinition",
					styleDefinitionId: id,
					family,
					layer,
					path,
				}),
		);
		if (mapped !== definition) {
			changed = true;
		}
		nextStyleDefinitions[id] = mapped;
	}

	const nextComponentDefinitions: Record<string, ComponentDefinition> = {};
	for (const [id, definition] of Object.entries(state.componentDefinitions)) {
		const mapped = mapComponentDefinition(definition, visitor);
		if (mapped !== definition) {
			changed = true;
		}
		nextComponentDefinitions[id] = mapped;
	}

	// Alias edges: `{kind:"alias", tokenId}` inside another token's
	// per-mode values. Not a `{kind:"token"}` spec ref, so it is walked
	// explicitly rather than through `mapSpecTokens`.
	const nextTokens: Record<string, AuthoringStateV1["tokens"][string]> = {};
	for (const [id, token] of Object.entries(state.tokens)) {
		let tokenChanged = false;
		const nextValues: Record<string, (typeof token.values)[string]> = {};
		for (const [modeId, value] of Object.entries(token.values)) {
			if (value.kind !== "alias") {
				nextValues[modeId] = value;
				continue;
			}
			const replacement = visitor(value.tokenId, {
				kind: "tokenAlias",
				tokenId: id,
				modeId,
			});
			if (replacement === undefined) {
				nextValues[modeId] = value;
				continue;
			}
			tokenChanged = true;
			nextValues[modeId] = replacement as (typeof token.values)[string];
		}
		if (tokenChanged) {
			changed = true;
			nextTokens[id] = { ...token, values: nextValues };
		} else {
			nextTokens[id] = token;
		}
	}

	if (!changed) {
		return state;
	}
	return {
		...state,
		nodes: nextNodes,
		styleDefinitions: nextStyleDefinitions,
		componentDefinitions: nextComponentDefinitions,
		tokens: nextTokens,
	};
}
