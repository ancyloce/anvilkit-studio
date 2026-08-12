/**
 * @file PLAN-0026 §3.2 (`p2-001`) — `readDocument`, the one projection
 * every editor surface reads through. Pure and React-free.
 *
 * Traversal is official `walkTree`, never a hand-rolled walk: a manual
 * walk over `data.content` misses slots and legacy zones, and that
 * class of bug is exactly what the Puck contract exists to prevent.
 * The pattern is inherited from `../puck/update-appearance.ts`, which
 * already collects nodes this way for the write path — read and write
 * therefore see the same tree.
 *
 * **State sources.** Only declared locations are read: node props
 * `appearance`, `interactions`, `bindings` and the component-instance
 * link, and root props `designSystem`, `componentLibrary`,
 * `editorAnnotations`. There is no sidecar read here and none may be
 * added — reading an undeclared location is a contract violation, not
 * a shortcut.
 *
 * **Schema access.** This directory may not import `@anvilkit/schema`:
 * `check:no-headless-import` allows the foundation validation packages
 * under `src/editor/` only. All parsing therefore goes through the
 * helpers in `../puck/read-appearance.ts`, which already owns that
 * import.
 *
 * ---
 *
 * **Why memoization is structural and not identity-based.**
 *
 * `walkTree` **rebuilds the tree it visits**. Measured 2026-08-07
 * against `@puckeditor/core@0.23.0`: the items handed to the mapper
 * are not the items in `data`, `item.props` is not the source props
 * object, nested values like `props.appearance` are fresh objects
 * too — and two consecutive walks over the *same* `data` produce
 * mutually non-identical props. It is a map, so it necessarily
 * allocates.
 *
 * The consequence matters beyond this file: **no `WeakMap` keyed on a
 * walked props object can ever hit**, so the obvious per-node identity
 * cache silently degrades to "always recompute" — it would look
 * correct and quietly re-run Zod over every node on every keystroke.
 *
 * So the per-node cache is keyed by node id and validated by
 * `deepEqualJson` over the node's **raw** carriers, compared *before*
 * parsing. An unchanged node therefore costs one shallow structural
 * comparison and no Zod work, and — the property `p2-005`'s
 * `useDeferredValue` binding depends on — yields the **same**
 * `DocumentNode` instance it returned last time.
 *
 * Two cache levels, both scoped by `Config` identity so one config can
 * never serve another's targets:
 *
 * 1. per component *type* — `resolveStyleTargets` and the inline-text
 *    declaration are functions of the type, so a 500-node document of
 *    12 types resolves 12 times, not 500;
 * 2. per node *id*, validated structurally as described above.
 *
 * Caching is an optimization only: a cold read and a warm read produce
 * structurally identical models.
 */

import type { InlineTextTarget } from "@anvilkit/contracts/editor";
import type { Config, Data } from "@puckeditor/core";
import { walkTree } from "@puckeditor/core";
import { deepEqualJson } from "../editor/patch.js";
import {
	type ResolvedStyleTarget,
	readEditorMetadataFor,
	resolveStyleTargets,
} from "../puck/component-metadata.js";
import {
	documentComponentLibrary,
	documentDesignSystem,
	parseComponentInstance,
	parseNodeAppearance,
	parseNodeBindings,
	parseNodeInteractions,
} from "../puck/read-appearance.js";
import { readComponentInstanceProp } from "./materialize.js";
import type {
	DocumentAnnotations,
	DocumentModel,
	DocumentNode,
	EditorAnnotation,
} from "./types.js";

/**
 * The instance-link prop is read through the single reader in
 * `./materialize.ts` (`p2-004` deliverable 4). Concentrating it there
 * is what made `p7-002`'s rename to `anvilComponentInstance` — and the
 * closure of the dual read that bridged it — a change in one place
 * rather than a hunt for string literals.
 */

const EMPTY_INLINE_TEXT: readonly InlineTextTarget[] = Object.freeze([]);
const EMPTY_ANNOTATIONS: DocumentAnnotations = Object.freeze({});

/** A projected node plus the raw carriers that produced it. */
interface NodeCacheEntry {
	readonly type: string;
	readonly rawAppearance: unknown;
	readonly rawInteractions: unknown;
	readonly rawBindings: unknown;
	readonly rawInstance: unknown;
	readonly node: DocumentNode;
}

/** Everything memoized for one `Config` identity. */
interface ConfigScope {
	readonly styleTargetsByType: Map<string, readonly ResolvedStyleTarget[]>;
	readonly inlineTextByType: Map<string, readonly InlineTextTarget[]>;
	/** Rebuilt on every read, so deleted nodes do not accumulate. */
	nodeCache: Map<string, NodeCacheEntry>;
	readonly modelByData: WeakMap<object, DocumentModel>;
}

const SCOPES = new WeakMap<Config, ConfigScope>();

function scopeFor(config: Config): ConfigScope {
	let scope = SCOPES.get(config);
	if (scope === undefined) {
		scope = {
			styleTargetsByType: new Map(),
			inlineTextByType: new Map(),
			nodeCache: new Map(),
			modelByData: new WeakMap(),
		};
		SCOPES.set(config, scope);
	}
	return scope;
}

function styleTargetsFor(
	scope: ConfigScope,
	config: Config,
	type: string,
): readonly ResolvedStyleTarget[] {
	let targets = scope.styleTargetsByType.get(type);
	if (targets === undefined) {
		targets = resolveStyleTargets(config, type);
		scope.styleTargetsByType.set(type, targets);
	}
	return targets;
}

function inlineTextFor(
	scope: ConfigScope,
	config: Config,
	type: string,
): readonly InlineTextTarget[] {
	let inlineText = scope.inlineTextByType.get(type);
	if (inlineText === undefined) {
		inlineText =
			readEditorMetadataFor(config, type)?.inlineText ?? EMPTY_INLINE_TEXT;
		scope.inlineTextByType.set(type, inlineText);
	}
	return inlineText;
}

/**
 * Project the declared `editorAnnotations` root prop (ADR 0007
 * decision 1). The shape is closed, so unknown keys inside an entry
 * are dropped rather than carried — carrying them is how a closed map
 * becomes a sidecar by accretion.
 */
function readAnnotations(data: Data): DocumentAnnotations {
	const raw = (data.root?.props as { editorAnnotations?: unknown } | undefined)
		?.editorAnnotations;
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return EMPTY_ANNOTATIONS;
	}
	const out: Record<string, EditorAnnotation> = {};
	for (const [nodeId, value] of Object.entries(raw)) {
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			continue;
		}
		const { name, locked } = value as { name?: unknown; locked?: unknown };
		const entry: { name?: string; locked?: boolean } = {};
		if (typeof name === "string") entry.name = name;
		if (typeof locked === "boolean") entry.locked = locked;
		if (entry.name !== undefined || entry.locked !== undefined) {
			out[nodeId] = entry;
		}
	}
	return Object.keys(out).length === 0 ? EMPTY_ANNOTATIONS : out;
}

function projectNode(
	scope: ConfigScope,
	nextCache: Map<string, NodeCacheEntry>,
	config: Config,
	nodeId: string,
	type: string,
	props: Record<string, unknown>,
): DocumentNode {
	const rawAppearance = props.appearance;
	const rawInteractions = props.interactions;
	const rawBindings = props.bindings;
	const rawInstance = readComponentInstanceProp(props);

	const previous = scope.nodeCache.get(nodeId);
	if (
		previous !== undefined &&
		previous.type === type &&
		deepEqualJson(previous.rawAppearance, rawAppearance) &&
		deepEqualJson(previous.rawInteractions, rawInteractions) &&
		deepEqualJson(previous.rawBindings, rawBindings) &&
		deepEqualJson(previous.rawInstance, rawInstance)
	) {
		nextCache.set(nodeId, previous);
		return previous.node;
	}

	const node: DocumentNode = {
		id: nodeId,
		type,
		appearance: parseNodeAppearance(rawAppearance),
		styleTargets: styleTargetsFor(scope, config, type),
		inlineText: inlineTextFor(scope, config, type),
		interactions: parseNodeInteractions(rawInteractions),
		bindings: parseNodeBindings(rawBindings),
		componentInstance: parseComponentInstance(rawInstance),
	};
	nextCache.set(nodeId, {
		type,
		rawAppearance,
		rawInteractions,
		rawBindings,
		rawInstance,
		node,
	});
	return node;
}

/**
 * Project `Data` + `Config` into the read model every editor surface
 * consumes.
 *
 * Pure: the same `(data, config)` always yields a structurally
 * identical model, and repeat calls on a reference-identical `data`
 * return the identical object.
 */
export function readDocument(data: Data, config: Config): DocumentModel {
	const scope = scopeFor(config);
	const cachedModel = scope.modelByData.get(data);
	if (cachedModel !== undefined) return cachedModel;

	const nodes = new Map<string, DocumentNode>();
	const nextCache = new Map<string, NodeCacheEntry>();
	walkTree(data, config, (content) => {
		for (const item of content) {
			const props = item.props as Record<string, unknown> | undefined;
			if (props === undefined) continue;
			const nodeId = props.id;
			if (typeof nodeId !== "string" || nodeId.length === 0) continue;
			nodes.set(
				nodeId,
				projectNode(
					scope,
					nextCache,
					config,
					nodeId,
					item.type as string,
					props,
				),
			);
		}
		return content;
	});
	scope.nodeCache = nextCache;

	const model: DocumentModel = {
		nodes,
		config,
		designSystem: documentDesignSystem(data),
		componentLibrary: documentComponentLibrary(data),
		annotations: readAnnotations(data),
	};
	scope.modelByData.set(data, model);
	return model;
}
