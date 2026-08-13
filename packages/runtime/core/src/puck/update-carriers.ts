/**
 * @file Interaction, binding and inline-text carrier commits
 * (PLAN-0026 §3.4; DD-0019 `ED-FA-012`). Pure and React-free.
 *
 * All three live in **declared component props** — this module moves
 * nothing out of `Data` (contract rule 2). It follows
 * `update-appearance.ts`'s shape exactly: validate against the
 * component's declaration FIRST, then one functional `setData` with
 * `recordHistory: true`, and never touch the document on a rejection.
 *
 * ## The carrier write is EXTRACTED, not re-derived
 *
 * Interactions and bindings were applied through the command bridge's
 * `node-carriers` plan kind (`puck/command-bridge.ts`), which `p3-009`
 * deletes. That code is the shipped, working behaviour, so it was moved
 * here rather than rewritten from the contract — including the two
 * details a re-derivation would most likely lose:
 *
 * - an update that empties a carrier **deletes the prop** rather than
 *   storing `[]`, which is the same canonical-absence rule appearance
 *   follows;
 * - an owner node that does not exist is an **error**, not a silent
 *   no-op, so a commit against a stale selection is reported.
 *
 * Nothing here imports from `command-bridge.ts`: the logic moved.
 *
 * ## Capability rejection is live, not theoretical
 *
 * Only 6 of 12 component packages declare `inlineText` today
 * (`ED-FA-012`), so the "component does not declare this" path is
 * reached in practice. It rejects **before** dispatch, mirroring
 * `update-appearance.ts`'s pre-dispatch allowlist check — an inspector
 * must never be able to commit something the component cannot honour.
 */

import type {
	Binding,
	EditorError,
	EditorPolicies,
	Interaction,
	TiptapDocument,
} from "@anvilkit/contracts/editor";
import type { Config, Data, PuckApi } from "@puckeditor/core";
import { walkTree } from "@puckeditor/core";
import { makeEditorError } from "../editor/diagnostics.js";
import { interactionsWriteErrors } from "../editor/interactions/validate.js";
import { deepEqualJson } from "../editor/patch.js";
import { dispatchOneIntent, failureStatus } from "./commit-protocol.js";
import { readEditorMetadataFor } from "./component-metadata.js";
import { type WriterGateDep, writerGateError } from "./writer-gate.js";

/** The two array-shaped node carriers this module writes. */
export type NodeCarrier = "interactions" | "bindings";

/** Outcome of a carrier write. */
export interface UpdateCarrierResult {
	/** The next document; the INPUT reference when nothing changed. */
	readonly data: Data;
	readonly status: "updated" | "noop" | "rejected";
	readonly changedNodeIds: readonly string[];
	readonly errors: readonly EditorError[];
}

const NO_IDS: readonly string[] = Object.freeze([]);

/** The declaring metadata for the node's component, if any. */
function declarationFor(
	data: Data,
	config: Config,
	nodeId: string,
): { readonly type: string; readonly declared: boolean } | undefined {
	let found: { type: string; declared: boolean } | undefined;
	walkTree(data, config, (content) => {
		for (const item of content) {
			const props = item.props as { id?: unknown };
			if (props.id === nodeId) {
				found = { type: String(item.type), declared: true };
			}
		}
		return content;
	});
	return found;
}

function rejected(
	data: Data,
	errors: readonly EditorError[],
): UpdateCarrierResult {
	return { data, status: "rejected", changedNodeIds: NO_IDS, errors };
}

/**
 * Apply an update to one node's array carrier.
 *
 * Extracted verbatim in behaviour from `command-bridge.ts`'s
 * `node-carriers` plan application.
 */
function applyCarrier(
	data: Data,
	config: Config,
	ownerNodeId: string,
	carrier: NodeCarrier,
	update: (current: readonly unknown[]) => readonly unknown[],
): { readonly data: Data; readonly changed: boolean } {
	let changed = false;
	const next = walkTree(data, config, (content) =>
		content.map((item) => {
			const props = item.props as Record<string, unknown>;
			if (props.id !== ownerNodeId) return item;
			const current = Array.isArray(props[carrier])
				? (props[carrier] as readonly unknown[])
				: [];
			const updated = update(current);
			if (deepEqualJson(current, updated)) return item;
			changed = true;
			const nextProps: Record<string, unknown> = { ...props };
			// Canonical absence: an emptied carrier is REMOVED, never `[]`.
			if (updated.length === 0) {
				delete nextProps[carrier];
			} else {
				nextProps[carrier] = updated;
			}
			return { ...item, props: nextProps as typeof item.props };
		}),
	);
	return { data: changed ? (next as Data) : data, changed };
}

/** Shared input of the two array-carrier writers. */
export interface UpdateCarrierInput<T> {
	readonly data: Data;
	readonly config: Config;
	/** The node that owns the carrier. */
	readonly nodeId: string;
	/** Pure edit over the current entries. */
	readonly update: (current: readonly T[]) => readonly T[];
	/**
	 * Host policies (§22.4). Only `allowRawUrls` is consulted, by the
	 * interactions writer's §16 URL validation.
	 */
	readonly policies?: EditorPolicies;
}

function updateArrayCarrier<T>(
	input: UpdateCarrierInput<T>,
	carrier: NodeCarrier,
	/**
	 * Optional write-time validation over the edit's RESULT. Runs after
	 * the capability gate and before anything is stored, so a rejected
	 * value never reaches the document and never creates a history
	 * entry.
	 */
	validate?: (next: readonly unknown[]) => readonly EditorError[],
): UpdateCarrierResult {
	const node = declarationFor(input.data, input.config, input.nodeId);
	if (node === undefined) {
		return rejected(input.data, [
			makeEditorError(
				"EDITOR_NODE_NOT_FOUND",
				`owner node "${input.nodeId}" not found for ${carrier}`,
				{ details: { nodeId: input.nodeId, carrier } },
			),
		]);
	}
	const metadata = readEditorMetadataFor(input.config, node.type);
	if (metadata?.[carrier] !== true) {
		return rejected(input.data, [
			makeEditorError(
				"EDITOR_CAPABILITY_UNSUPPORTED",
				`component "${node.type}" does not declare ${carrier}`,
				{ nodeIds: [input.nodeId], details: { carrier, type: node.type } },
			),
		]);
	}
	let validationErrors: readonly EditorError[] = [];
	const applied = applyCarrier(
		input.data,
		input.config,
		input.nodeId,
		carrier,
		(current) => {
			const next = (
				input.update as (value: readonly unknown[]) => readonly unknown[]
			)(current);
			if (validate !== undefined && validationErrors.length === 0) {
				validationErrors = validate(next);
			}
			return next;
		},
	);
	if (validationErrors.length > 0) {
		return rejected(input.data, validationErrors);
	}
	if (!applied.changed) {
		return {
			data: input.data,
			status: "noop",
			changedNodeIds: NO_IDS,
			errors: [],
		};
	}
	return {
		data: applied.data,
		status: "updated",
		changedNodeIds: [input.nodeId],
		errors: [],
	};
}

/**
 * Write a node's declared `interactions` carrier.
 *
 * The §16 URL rules run here (`p3-009`). They used to live only in the
 * command engine's `interactionCreateErrors`/`interactionUpdateErrors`,
 * which this write path replaced without inheriting them — so a
 * `javascript:` action could reach the document through the canonical
 * writer while the deleted one refused it. Validation runs on the
 * edit's RESULT, not on its input, because the edit is an arbitrary
 * pure function and only its output is what would be stored.
 */
export function updateInteractionsInData(
	input: UpdateCarrierInput<Interaction>,
): UpdateCarrierResult {
	return updateArrayCarrier(input, "interactions", (next) =>
		interactionsWriteErrors(next as readonly Interaction[], input.policies),
	);
}

/** Write a node's declared `bindings` carrier. */
export function updateBindingsInData(
	input: UpdateCarrierInput<Binding>,
): UpdateCarrierResult {
	return updateArrayCarrier(input, "bindings");
}

/** Input to {@link updateInlineTextInData}. */
export interface UpdateInlineTextInput {
	readonly data: Data;
	readonly config: Config;
	readonly nodeId: string;
	/** The declared inline-text target's id. */
	readonly targetId: string;
	/**
	 * The authored value. A `plain` target takes a string; a `tiptap`
	 * target takes a `TiptapDocument`. The declared `format` decides
	 * which is accepted — a mismatch is rejected before dispatch, so a
	 * plain field can never come to hold a document node.
	 */
	readonly value: string | TiptapDocument;
}

/** Write a value at a declared inline-text target's prop path. */
export function updateInlineTextInData(
	input: UpdateInlineTextInput,
): UpdateCarrierResult {
	const node = declarationFor(input.data, input.config, input.nodeId);
	if (node === undefined) {
		return rejected(input.data, [
			makeEditorError(
				"EDITOR_NODE_NOT_FOUND",
				`owner node "${input.nodeId}" not found for inline text`,
				{ details: { nodeId: input.nodeId } },
			),
		]);
	}
	const metadata = readEditorMetadataFor(input.config, node.type);
	const target = metadata?.inlineText?.find(
		(entry) => entry.id === input.targetId,
	);
	if (target === undefined) {
		return rejected(input.data, [
			makeEditorError(
				"EDITOR_CAPABILITY_UNSUPPORTED",
				`component "${node.type}" does not declare inline-text target "${input.targetId}"`,
				{
					nodeIds: [input.nodeId],
					details: { targetId: input.targetId, type: node.type },
				},
			),
		]);
	}
	const isPlain = typeof input.value === "string";
	if ((target.format === "plain") !== isPlain) {
		return rejected(input.data, [
			makeEditorError(
				"EDITOR_INVALID_CSS_VALUE",
				`inline-text target "${input.targetId}" is declared "${target.format}"; the committed value does not match`,
				{
					nodeIds: [input.nodeId],
					details: { targetId: input.targetId, format: target.format },
				},
			),
		]);
	}

	let changed = false;
	const next = walkTree(input.data, input.config, (content) =>
		content.map((item) => {
			const props = item.props as Record<string, unknown>;
			if (props.id !== input.nodeId) return item;
			if (deepEqualJson(props[target.propPath], input.value)) return item;
			changed = true;
			return {
				...item,
				props: {
					...props,
					[target.propPath]: input.value,
				} as typeof item.props,
			};
		}),
	);
	if (!changed) {
		return {
			data: input.data,
			status: "noop",
			changedNodeIds: NO_IDS,
			errors: [],
		};
	}
	return {
		data: next as Data,
		status: "updated",
		changedNodeIds: [input.nodeId],
		errors: [],
	};
}

/** Dependencies of the carrier commit helpers. */
export interface CarrierCommitDeps extends WriterGateDep {
	readonly getPuckApi: () => PuckApi;
}

/** Outcome of a carrier commit attempt. */
export interface CarrierCommitResult {
	readonly status: "committed" | "noop" | "rejected";
	readonly changedNodeIds: readonly string[];
	readonly errors: readonly EditorError[];
}

function commit(
	deps: CarrierCommitDeps,
	run: (data: Data, config: Config) => UpdateCarrierResult,
): CarrierCommitResult {
	const gate = writerGateError(deps);
	if (gate !== null) {
		return { status: "rejected", changedNodeIds: NO_IDS, errors: [gate] };
	}
	const api = deps.getPuckApi();
	const config = api.config as Config;
	const attempt = dispatchOneIntent<UpdateCarrierResult>(api, (data) =>
		run(data, config),
	);
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
		errors: [],
	};
}

/** Commit one interactions edit as ONE history entry. */
export function commitInteractionsUpdate(
	deps: CarrierCommitDeps,
	nodeId: string,
	update: (current: readonly Interaction[]) => readonly Interaction[],
): CarrierCommitResult {
	return commit(deps, (data, config) =>
		updateInteractionsInData({ data, config, nodeId, update }),
	);
}

/** Commit one bindings edit as ONE history entry. */
export function commitBindingsUpdate(
	deps: CarrierCommitDeps,
	nodeId: string,
	update: (current: readonly Binding[]) => readonly Binding[],
): CarrierCommitResult {
	return commit(deps, (data, config) =>
		updateBindingsInData({ data, config, nodeId, update }),
	);
}

/** Commit one inline-text edit as ONE history entry. */
export function commitInlineTextUpdate(
	deps: CarrierCommitDeps,
	input: Omit<UpdateInlineTextInput, "data" | "config">,
): CarrierCommitResult {
	return commit(deps, (data, config) =>
		updateInlineTextInData({ ...input, data, config }),
	);
}
