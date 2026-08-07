/**
 * @file PLAN-0026 §3.8.1 / DD-0019 `ED-FA-002` (`p2-004`) — the
 * component-library read model: definitions, instances, and the
 * resolved instance tree. Pure and React-free.
 *
 * **Why this task exists.** `root.props.componentLibrary` is a declared
 * root prop that, before this task, had *zero readers*: every
 * definition/variant/instance implementation read the sidecar
 * (`editor/components/*`), all of which PLAN-0026 §3.1 deletes. Left
 * uncorrected the rewrite would have removed local components,
 * variants, instances and detach from the product. This is the read
 * half; `p3-001`…`p3-003` land the write half, and only then may the
 * sidecar files go.
 *
 * ---
 *
 * ## Resolution precedence — DD-0019 §14.4, in this exact order
 *
 *   1. definition base
 *   2. variant patch
 *   3. exposed property override
 *   4. instance node override
 *   5. breakpoint override
 *
 * The order **is** the contract: an implementation that happens to
 * produce the right answer for the fixtures by a different order is not
 * correct (`CFX-C05`). Steps 1–4 are `materializeInstance`'s, applied
 * verbatim — prop patches land in the tree at their own step rather
 * than being deferred to one final merge, precisely so the variant
 * patch cannot overwrite exposed properties and invert the order.
 *
 * Step 5 is deliberately **not** applied here. Breakpoint overrides are
 * a style-cascade concern and belong to `resolveTargetAppearance`
 * (`editor/resolve/node.ts`), which consumes the per-node authoring
 * families this module returns. Applying them twice, or here, would
 * fork the style pipeline — contract rule 3. This split is why
 * `materialize.ts`'s own header states the chain as four steps: the
 * fifth lives one layer up, and `CFX-C05` is marked `pageOnlyLayer`
 * for that reason.
 *
 * ## Two passes, never one
 *
 * Resolution is **tolerant**: an override addressing a definition node
 * that no longer exists simply matches nothing and sits inert.
 * Diagnosis is a **separate** pass ({@link collectOrphanOverrides}), so
 * an orphan is retained as diagnosable data rather than being dropped
 * during resolution or reapplied somewhere it does not belong
 * (`CFX-C09`, ADR 0005). Merging the two passes would lose exactly that
 * distinction.
 *
 * ## Cost
 *
 * Materializing every instance is O(instances × definition size), so it
 * is **not** computed eagerly inside `readDocument` — that runs on
 * every keystroke and `p2-005` binds it through `useDeferredValue`.
 * `readComponentLibrary` is memoized per `DocumentModel` identity
 * instead: first call pays, repeat calls are free, and a document with
 * no instances pays nothing at all.
 */

import type {
	ComponentDefinition,
	ComponentInstanceState,
	EditorError,
	NodeOverridePatch,
	SerializablePuckNode,
} from "@anvilkit/contracts/editor";
import { makeEditorError } from "../editor/diagnostics.js";
import {
	collectDefinitionNodeIds,
	formatComponentPath,
	type MaterializeResult,
	materializeInstance,
} from "./materialize.js";
import type { DocumentModel } from "./types.js";

/** One override whose target definition node no longer exists. */
export interface OrphanOverride {
	readonly instanceNodeId: string;
	readonly definitionId: string;
	readonly definitionNodeId: string;
}

/** One node's instance, resolved through the §14.4 chain. */
export interface ResolvedInstance {
	/** The page node carrying the instance. */
	readonly instanceNodeId: string;
	readonly instance: ComponentInstanceState;
	/** The definition it points at, when resolvable. */
	readonly definition: ComponentDefinition | undefined;
	/**
	 * The materialized subtree, or `undefined` when resolution failed.
	 * Runtime ids (`instanceNode::definitionNode`) are output-only and
	 * never written back to the document.
	 */
	readonly node: SerializablePuckNode | undefined;
	/** Runtime node id → authoring families for the style resolver. */
	readonly authoring: Readonly<
		Record<string, Omit<NodeOverridePatch, "props">>
	>;
	readonly status: MaterializeResult["status"];
	readonly diagnostics: readonly EditorError[];
}

/** The component library, projected from declared props only. */
export interface ComponentLibraryModel {
	/** Definitions by id, from `root.props.componentLibrary`. */
	readonly definitions: Readonly<Record<string, ComponentDefinition>>;
	/** Resolved instances by the page node id carrying them. */
	readonly instances: ReadonlyMap<string, ResolvedInstance>;
	/** Overrides pointing at definition nodes that no longer exist. */
	readonly orphanOverrides: readonly OrphanOverride[];
	/** Every diagnostic from resolution and orphan detection. */
	readonly diagnostics: readonly EditorError[];
}

const EMPTY_AUTHORING: Readonly<
	Record<string, Omit<NodeOverridePatch, "props">>
> = Object.freeze({});
const EMPTY_ORPHANS: readonly OrphanOverride[] = Object.freeze([]);
const EMPTY_DIAGNOSTICS: readonly EditorError[] = Object.freeze([]);

/** Turn a non-materialized outcome into its user-facing diagnostic. */
function failureDiagnostic(
	instanceNodeId: string,
	result: Exclude<MaterializeResult, { status: "materialized" }>,
	definitions: Readonly<Record<string, ComponentDefinition>>,
): EditorError {
	if (result.status === "missing-definition") {
		return makeEditorError(
			"EDITOR_DEFINITION_UNAVAILABLE",
			`component definition "${result.definitionId}" is not in this document`,
			{
				severity: "warning",
				nodeIds: [instanceNodeId],
				details: { kind: "component", definitionId: result.definitionId },
			},
		);
	}
	const path = formatComponentPath(result.path, definitions);
	return result.status === "cycle"
		? makeEditorError("EDITOR_COMPONENT_CYCLE", `component cycle: ${path}`, {
				severity: "warning",
				nodeIds: [instanceNodeId],
				details: { kind: "component", path: [...result.path] },
			})
		: makeEditorError(
				"EDITOR_LIMIT_EXCEEDED",
				`component nesting is too deep: ${path}`,
				{
					severity: "warning",
					nodeIds: [instanceNodeId],
					details: {
						kind: "component",
						reason: "componentNestingDepth",
						path: [...result.path],
					},
				},
			);
}

/**
 * Overrides whose target definition node has been removed.
 *
 * Re-signatured onto the carrier by `p2-004` — the sidecar version
 * (`editor/components/instances.ts`) walked `AuthoringStateV1.nodes`
 * and `state.componentDefinitions`; this reads the same information
 * from declared node props and `root.props.componentLibrary`. The
 * logic is otherwise identical, including the deliberate exclusion of
 * unresolvable definitions: a missing definition is a *different*
 * condition (retention, `CFX-C14`), not an orphan override.
 */
export function collectOrphanOverrides(
	model: DocumentModel,
	definitions: Readonly<Record<string, ComponentDefinition>>,
): readonly OrphanOverride[] {
	const orphans: OrphanOverride[] = [];
	const idCache = new Map<string, ReadonlySet<string>>();
	for (const [instanceNodeId, node] of model.nodes) {
		const instance = node.componentInstance;
		if (instance === undefined) continue;
		const definition = definitions[instance.definitionId];
		if (definition === undefined) continue;
		let ids = idCache.get(instance.definitionId);
		if (ids === undefined) {
			ids = collectDefinitionNodeIds(definition);
			idCache.set(instance.definitionId, ids);
		}
		for (const definitionNodeId of Object.keys(instance.nodeOverrides)) {
			if (!ids.has(definitionNodeId)) {
				orphans.push({
					instanceNodeId,
					definitionId: instance.definitionId,
					definitionNodeId,
				});
			}
		}
	}
	return orphans.length === 0 ? EMPTY_ORPHANS : orphans;
}

/**
 * An orphan override as a user-facing diagnostic.
 *
 * Encoded as `EDITOR_NODE_NOT_FOUND` + `details.kind: "orphanOverride"`,
 * **not** a dedicated `EDITOR_ORPHAN_OVERRIDE` code, and identical to
 * the sidecar implementation this replaces
 * (`editor/components/instances.ts`).
 *
 * `p2-004`'s acceptance criterion asks for the ADR 0005 §4(b)
 * `*_ORPHAN_OVERRIDE` suffix, but that collides head-on with contract
 * freeze CORE-P0-001 §8, stated at the top of
 * `contracts/src/editor/errors.ts`: "the code union is exactly the
 * fourteen codes of §9.5 — sub-cases are distinguished via `details`,
 * never via new codes". A fifteenth code was tried and rejected by the
 * freeze's own guard (`editor-i18n-catalog.test.ts` asserts the count
 * is 14). Sub-case-via-`details` is the sanctioned encoding, so it is
 * what is used; the conflict is raised in the task completion note
 * rather than resolved by weakening either side.
 */
function orphanDiagnostic(orphan: OrphanOverride): EditorError {
	return makeEditorError(
		"EDITOR_NODE_NOT_FOUND",
		`override targets definition node "${orphan.definitionNodeId}", which no longer exists in "${orphan.definitionId}"`,
		{
			severity: "warning",
			nodeIds: [orphan.instanceNodeId],
			details: {
				kind: "orphanOverride",
				definitionId: orphan.definitionId,
				definitionNodeId: orphan.definitionNodeId,
			},
		},
	);
}

const MEMO = new WeakMap<DocumentModel, ComponentLibraryModel>();

/**
 * Project the document's component library: definitions, every
 * instance resolved through the §14.4 chain, and the diagnostics that
 * resolution and orphan detection produce.
 *
 * Pure and memoized per model identity — never a store, never
 * round-tripped, always recomputable from `Data`.
 */
export function readComponentLibrary(
	model: DocumentModel,
): ComponentLibraryModel {
	const cached = MEMO.get(model);
	if (cached !== undefined) return cached;

	const definitions = model.componentLibrary?.definitions ?? {};
	const instances = new Map<string, ResolvedInstance>();
	const diagnostics: EditorError[] = [];

	for (const [instanceNodeId, node] of model.nodes) {
		const instance = node.componentInstance;
		if (instance === undefined) continue;
		const result = materializeInstance(instanceNodeId, instance, definitions);
		const localDiagnostics =
			result.status === "materialized"
				? EMPTY_DIAGNOSTICS
				: [failureDiagnostic(instanceNodeId, result, definitions)];
		diagnostics.push(...localDiagnostics);
		instances.set(instanceNodeId, {
			instanceNodeId,
			instance,
			definition: definitions[instance.definitionId],
			node: result.status === "materialized" ? result.node : undefined,
			authoring:
				result.status === "materialized" ? result.authoring : EMPTY_AUTHORING,
			status: result.status,
			diagnostics: localDiagnostics,
		});
	}

	// Second pass, deliberately separate from resolution (see header).
	const orphanOverrides = collectOrphanOverrides(model, definitions);
	for (const orphan of orphanOverrides) {
		diagnostics.push(orphanDiagnostic(orphan));
	}

	const projection: ComponentLibraryModel = {
		definitions,
		instances,
		orphanOverrides,
		diagnostics: diagnostics.length === 0 ? EMPTY_DIAGNOSTICS : diagnostics,
	};
	MEMO.set(model, projection);
	return projection;
}
