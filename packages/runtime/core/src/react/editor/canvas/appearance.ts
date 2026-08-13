"use client";

/**
 * @file The canvas read/write seam (PLAN-0028 `p4-006`, PLAN-0026
 * §3.5). Every canvas surface — handles, the align/distribute toolbar —
 * reads capability and authored state through here and commits through
 * here. Nothing in `canvas/` dispatches a command any more.
 *
 * ### Why this is not `useAppearanceCommit`
 *
 * `composition/use-appearance-commit.ts` is the same intent bound with
 * `useGetPuck`, and it is the right hook for anything rendered *inside*
 * `<Puck>`. The canvas overlay is not: `StudioEditorMount` renders
 * `EditorRoot` as a **sibling** of the `<Puck>` subtree
 * (`StudioEditorMount.tsx:66-75`), and a `createPortal` into the canvas
 * iframe keeps React context from where the component is *rendered*, not
 * where its DOM lands. `useGetPuck` / `useReactivePuck` therefore throw
 * here — the constraint `command-port.ts:144-164` already documents, and
 * the reason `tryGetPuckApi` exists.
 *
 * So this module binds the **same pure helpers** the hook wraps —
 * `updateAppearanceInData` for writes, `puck/read-appearance.ts` for
 * reads (the module `document-model/read-node-field.ts` itself delegates
 * to) — through the port's existing `PuckApi` injection. One write
 * implementation, one read implementation, two bindings.
 *
 * ### One gesture, one history entry
 *
 * `commitCanvasAppearance` takes a LIST of ops and folds them into one
 * `Data` before dispatching once with `recordHistory: true`. That is
 * what makes a corner resize (width **and** height) and an align across
 * five absolute nodes (five different `inset` values) a single undo —
 * the same fold `puck/command-bridge.ts:342-371` performs for the
 * legacy vocabulary, expressed over the canonical patch type instead of
 * over commands.
 *
 * ### Node-addressed by default
 *
 * `targetId` defaults to `ROOT_STYLE_TARGET_ID`. Handles stay
 * node-addressed in page mode by construction; target-addressed canvas
 * affordances are explicitly out of scope (PLAN-0026 §8, `p5-003`).
 *
 * ### Puck contract
 *
 * Rule 2: every write lands in the declared `props.appearance` carrier
 * and nothing else. Rule 3: one pipeline — the canvas commits through
 * exactly the helper the inspector commits through, so a value dragged
 * on canvas and a value typed in the panel produce the same document.
 */

import type {
	AuthorableStyleProperty,
	EditorError,
	ResponsiveLayerRef,
} from "@anvilkit/contracts/editor";
import type { ComponentData, Config, Data, PuckApi } from "@puckeditor/core";
import { makeEditorError } from "../../../editor/diagnostics.js";
import {
	dispatchOneIntent,
	failureStatus,
	type IntentOutcome,
} from "../../../puck/commit-protocol.js";
import { resolveStyleTargets } from "../../../puck/component-metadata.js";
import {
	documentBreakpoints,
	parseNodeAppearance,
	readAppearanceProperty,
} from "../../../puck/read-appearance.js";
import { ROOT_STYLE_TARGET_ID } from "../../../puck/targets.js";
import { isNodeLocked } from "../../../puck/update-annotations.js";
import type { AppearancePatch } from "../../../puck/update-appearance.js";
import { updateAppearanceInData } from "../../../puck/update-appearance.js";
import {
	type WriterGateDep,
	writerGateError,
} from "../../../puck/writer-gate.js";

/** One appearance write inside a single canvas intent. */
export interface CanvasAppearanceOp {
	/** Plural from the start — the write path's own address shape. */
	readonly nodeIds: readonly string[];
	/** Defaults to the node's root target (page-mode addressing). */
	readonly targetId?: string;
	readonly patch: AppearancePatch;
}

/** Outcome of a canvas commit attempt. Mirrors `AppearanceCommitResult`. */
export interface CanvasCommitResult {
	readonly status: "committed" | "noop" | "rejected";
	readonly changedNodeIds: readonly string[];
	readonly errors: readonly EditorError[];
}

/**
 * The live `PuckApi` (or `null` when unmounted), plus the collab
 * writer gate — the canvas writes through `updateAppearanceInData`
 * directly rather than through `commitAppearanceUpdate`, so it carries
 * the gate itself (`p3-009`). Both come off the bridge.
 */
export interface CanvasCommitDeps extends WriterGateDep {
	readonly getPuckApi: () => PuckApi | null;
}

/** Everything one canvas intent needs to become one history entry. */
export interface CanvasCommitInput {
	readonly layer: ResponsiveLayerRef;
	readonly ops: readonly CanvasAppearanceOp[];
}

const NO_ERRORS: readonly EditorError[] = Object.freeze([]);
const NO_IDS: readonly string[] = Object.freeze([]);
const NO_PROPERTIES: ReadonlySet<AuthorableStyleProperty> = new Set();

/**
 * Fold every op into one next document. Pure.
 *
 * All-or-nothing: a rejected op abandons the whole intent and returns
 * the INPUT document, because a partially-applied gesture is a document
 * state no user asked for.
 */
/**
 * `applyCanvasAppearanceOps`'s result, tagged with the status the shared
 * commit protocol dispatches on (review 0036 M-2).
 */
interface CanvasAppearanceOutcome extends IntentOutcome {
	readonly changedNodeIds: readonly string[];
}

export function applyCanvasAppearanceOps(
	data: Data,
	config: Config,
	layer: ResponsiveLayerRef,
	ops: readonly CanvasAppearanceOp[],
): {
	readonly data: Data;
	readonly changedNodeIds: readonly string[];
	readonly errors: readonly EditorError[];
} {
	let current = data;
	const changed = new Set<string>();
	for (const op of ops) {
		if (op.nodeIds.length === 0) {
			continue;
		}
		const result = updateAppearanceInData({
			data: current,
			config,
			nodeIds: op.nodeIds,
			targetId: op.targetId ?? ROOT_STYLE_TARGET_ID,
			layer,
			patch: op.patch,
		});
		if (result.status === "rejected") {
			return { data, changedNodeIds: NO_IDS, errors: result.errors };
		}
		for (const nodeId of result.changedNodeIds) {
			changed.add(nodeId);
		}
		current = result.data;
	}
	return {
		data: current,
		changedNodeIds: [...changed].sort(),
		errors: NO_ERRORS,
	};
}

/**
 * Commit one canvas intent as exactly ONE history-recording dispatch.
 *
 * A no-op or a rejection dispatches nothing, so a drag that ends where
 * it started creates no history entry — the same rule
 * `commitAppearanceUpdate` follows, and the reason "release the pointer"
 * and "press undo once" line up.
 */
export function commitCanvasAppearance(
	deps: CanvasCommitDeps,
	input: CanvasCommitInput,
): CanvasCommitResult {
	const gate = writerGateError(deps);
	if (gate !== null) {
		return { status: "rejected", changedNodeIds: NO_IDS, errors: [gate] };
	}
	const api = deps.getPuckApi();
	if (api === null) {
		return {
			status: "rejected",
			changedNodeIds: NO_IDS,
			errors: [
				makeEditorError(
					"EDITOR_COMMAND_CONFLICT",
					"<Puck> is not mounted; the canvas has no document to commit against",
				),
			],
		};
	}
	const config = api.config as Config;
	// `applyCanvasAppearanceOps` reports by shape rather than by status, so
	// it is adapted onto the shared commit protocol's outcome here.
	const attempt = dispatchOneIntent<CanvasAppearanceOutcome>(api, (data) => {
		const applied = applyCanvasAppearanceOps(
			data,
			config,
			input.layer,
			input.ops,
		);
		if (applied.errors.length > 0) {
			return { ...applied, data, status: "rejected" };
		}
		return {
			...applied,
			status: applied.data === data ? "noop" : "updated",
		};
	});
	if (!attempt.committed) {
		return {
			status: failureStatus(attempt.outcome),
			changedNodeIds: NO_IDS,
			errors: attempt.outcome.errors,
		};
	}
	return {
		status: "committed",
		changedNodeIds: attempt.outcome.changedNodeIds,
		errors: NO_ERRORS,
	};
}

/**
 * One node's live `ComponentData`, or `undefined`.
 *
 * Puck's id index throws while its app state is mid-transition (notably
 * the render right after undoing a tree mutation) — the same hazard
 * `capability-registry.ts:80-95` documents. A canvas read is advisory,
 * so it degrades to "not mounted" instead of taking the overlay down.
 */
function itemOf(api: PuckApi, nodeId: string): ComponentData | undefined {
	try {
		return api.getItemById(nodeId) as ComponentData | undefined;
	} catch {
		return undefined;
	}
}

/** A node's declared component type, or `undefined` when unmounted. */
export function nodeTypeOf(api: PuckApi, nodeId: string): string | undefined {
	const item = itemOf(api, nodeId);
	return item === undefined || item === null ? undefined : item.type;
}

/**
 * The properties one style target grants on a node — read through the
 * single capability reader (`p2-006`), memoized per `(config, type)`.
 *
 * Asking the TARGET rather than the component is the whole point: the
 * union over every declared target (what `grantedProperties` returns)
 * would offer a handle for `padding` on a component that grants padding
 * only on `cardTitle`, and the commit at `root` would then be rejected.
 * A canvas affordance must never be offered where its own commit fails.
 */
export function grantedTargetProperties(
	api: PuckApi,
	nodeId: string,
	targetId: string = ROOT_STYLE_TARGET_ID,
): ReadonlySet<AuthorableStyleProperty> {
	const type = nodeTypeOf(api, nodeId);
	if (type === undefined) {
		return NO_PROPERTIES;
	}
	const target = resolveStyleTargets(api.config as Config, type).find(
		(entry) => entry.id === targetId,
	);
	return target === undefined ? NO_PROPERTIES : new Set(target.properties);
}

/**
 * The EFFECTIVE authored value of one property at `layer`, read through
 * the read model's own projection (`puck/read-appearance.ts`, the module
 * `readNodeField` delegates to).
 *
 * Scoped to one node on purpose: `readNodeField` needs a whole
 * `DocumentModel`, and projecting the document on every scroll-driven
 * overlay render would put a full `walkTree` inside the gesture frame.
 * The projection math, the capability filtering, and the layer cascade
 * are the read model's — only the collection step is narrowed.
 *
 * Returns `undefined` for `mixed` / `unset` / `unsupported`, which is
 * exactly what a merge base wants: nothing to preserve.
 */
export function readAuthoredProperty<T>(
	api: PuckApi,
	nodeId: string,
	targetId: string,
	property: AuthorableStyleProperty,
	layer: ResponsiveLayerRef,
): T | undefined {
	const item = itemOf(api, nodeId);
	if (item === undefined || item === null) {
		return undefined;
	}
	const props = item.props as { readonly appearance?: unknown };
	const state = readAppearanceProperty({
		nodes: new Map([
			[
				nodeId,
				{
					nodeId,
					type: item.type,
					appearance: parseNodeAppearance(props.appearance),
				},
			],
		]),
		config: api.config as Config,
		breakpoints: documentBreakpoints(api.appState.data as Data),
		nodeIds: [nodeId],
		targetId,
		layer,
		property,
	});
	return state.kind === "value" ? (state.value as T) : undefined;
}

/**
 * Whether a node refuses mutating gestures (`p3-006` `editorAnnotations`).
 *
 * Locked nodes stay **selectable** — `selection.ts:11-13` states that
 * rule and the Layers panel relies on it — so the fence lives here, at
 * every canvas mutation site, rather than in the marquee.
 */
export function isCanvasNodeLocked(api: PuckApi, nodeId: string): boolean {
	return isNodeLocked(api.appState.data as Data, nodeId);
}
