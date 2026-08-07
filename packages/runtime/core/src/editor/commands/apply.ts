/**
 * @file `applyEditorCommand` — revision gate, validation, reduction,
 * noop detection, batch atomicity (PLAN-0020 CORE-P0-008; DD-0019
 * §24.2; contract freeze CORE-P0-001 §5, §9–§10).
 *
 * Deterministic and side-effect free. Batches validate sequentially
 * against the intermediate state produced by their predecessors and
 * commit all-or-nothing; only the batch-level `expectedRevision` is
 * compared; a committed transaction (atomic or batch) increments the
 * revision by exactly 1.
 */

import type {
	EditorError,
} from "@anvilkit/contracts/editor";
import type {
	EditorCommand,
} from "../legacy/index.js";
import type {
	AuthoringStateV1,
} from "../legacy/index.js";
import { makeEditorError } from "../diagnostics.js";
import { deepEqualJson } from "../patch.js";
import { reduceValidatedCommand } from "./reduce.js";
import {
	validateAtomicCommand,
	type ValidateCommandOptions,
	validateEditorCommand,
} from "./validate.js";

/** Which parts of the document a committed transaction touched. */
export interface AuthoringChangeSet {
	readonly changedNodeIds: readonly string[];
	readonly changedCollections: readonly string[];
}

/** The empty change set (rejected and noop results). */
export const EMPTY_CHANGE_SET: AuthoringChangeSet = {
	changedNodeIds: [],
	changedCollections: [],
};

/** The result of applying a command to authoring state. */
export interface EditorReduceResult {
	readonly status: "changed" | "rejected" | "noop";
	readonly state: AuthoringStateV1;
	readonly errors: readonly EditorError[];
	readonly changes: AuthoringChangeSet;
}

const COLLECTION_KEYS = [
	"breakpoints",
	"nodes",
	"tokens",
	"tokenModes",
	"styleDefinitions",
	"componentDefinitions",
	"interactions",
	"bindings",
] as const;

/**
 * Diff two states into a change set. Reference equality is the fast
 * path (reducers preserve references on no-op writes); canonical
 * serialization settles the rest.
 */
export function diffAuthoringState(
	prev: AuthoringStateV1,
	next: AuthoringStateV1,
): AuthoringChangeSet {
	if (prev === next) {
		return EMPTY_CHANGE_SET;
	}
	const changedCollections: string[] = [];
	const changedNodeIds: string[] = [];
	for (const key of COLLECTION_KEYS) {
		if (prev[key] === next[key]) {
			continue;
		}
		if (key === "nodes") {
			const nodeIds = new Set([
				...Object.keys(prev.nodes),
				...Object.keys(next.nodes),
			]);
			for (const nodeId of nodeIds) {
				if (prev.nodes[nodeId] !== next.nodes[nodeId]) {
					changedNodeIds.push(nodeId);
				}
			}
			if (changedNodeIds.length > 0) {
				changedCollections.push("nodes");
			}
			continue;
		}
		changedCollections.push(key);
	}
	return { changedNodeIds, changedCollections };
}

function reject(
	state: AuthoringStateV1,
	errors: readonly EditorError[],
): EditorReduceResult {
	return { status: "rejected", state, errors, changes: EMPTY_CHANGE_SET };
}

/**
 * Noop detection (DD-0019 §24.2 `deepEqual(next, state)`).
 *
 * Reference equality is the fast path: every reducer upholds the
 * **reference-preservation invariant** — a value-identical write
 * returns the input objects unchanged at every level
 * (`applyEditorPatch`, `setResponsiveEntry`, `withRecord` all
 * short-circuit), so single-command noops never allocate. Batches
 * can be net-zero through *distinct* intermediate states (lock then
 * unlock), so a structural fallback settles refs-differ cases. That
 * fallback is cheap by construction: untouched substructure is
 * reference-shared between `prev` and `next`, so `deepEqualJson`
 * short-circuits per subtree — unlike a canonical-serialization
 * compare, which measured ~120 ms at the §7.3 limits and would blow
 * the §28 ≤20 ms per-dispatch budget (CORE-P0-015 benchmark).
 */
function isNoopReduction(
	next: AuthoringStateV1,
	state: AuthoringStateV1,
): boolean {
	return next === state || deepEqualJson(next, state);
}

/**
 * Apply a command (DD-0019 §24.2, verbatim pipeline): strict
 * `expectedRevision` compare → validate → reduce → deep-equal noop
 * detection → `revision + 1` plus change set.
 */
export function applyEditorCommand(
	state: AuthoringStateV1,
	command: EditorCommand,
	options: ValidateCommandOptions = {},
): EditorReduceResult {
	// The transaction's entry state, for policy checks that must not be
	// judged against a batch's intermediate state (freeze §4).
	const validateOptions: ValidateCommandOptions = {
		...options,
		entryState: options.entryState ?? state,
	};
	if (command.expectedRevision !== state.revision) {
		return reject(state, [
			makeEditorError(
				"EDITOR_COMMAND_CONFLICT",
				`expected revision ${command.expectedRevision} but document is at ${state.revision}`,
				{
					details: {
						expectedRevision: command.expectedRevision,
						revision: state.revision,
					},
				},
			),
		]);
	}

	const envelopeErrors = validateEditorCommand(
		state,
		command,
		validateOptions,
	);
	if (envelopeErrors.some((error) => error.severity === "error")) {
		return reject(state, envelopeErrors);
	}

	let next = state;
	const warnings: EditorError[] = [...envelopeErrors];

	if (command.type === "batch") {
		// Sequential validate-against-intermediate-state; all-or-nothing
		// (contract freeze CORE-P0-001 §5). Member expectedRevision
		// fields are deliberately ignored.
		for (const [index, member] of command.commands.entries()) {
			const memberErrors = validateAtomicCommand(
				next,
				member,
				validateOptions,
			);
			if (memberErrors.some((error) => error.severity === "error")) {
				return reject(state, [
					...memberErrors.map((error) => ({
						...error,
						details: { ...error.details, batchIndex: index },
					})),
				]);
			}
			warnings.push(...memberErrors);
			next = reduceValidatedCommand(next, member);
		}
	} else {
		next = reduceValidatedCommand(state, command);
	}

	if (isNoopReduction(next, state)) {
		return {
			status: "noop",
			state,
			errors: warnings,
			changes: EMPTY_CHANGE_SET,
		};
	}

	return {
		status: "changed",
		state: { ...next, revision: state.revision + 1 },
		errors: warnings,
		changes: diffAuthoringState(state, next),
	};
}
