/**
 * @file Node authoring-record helpers (PLAN-0020 CORE-P0-008,
 * extracted for CORE-P2-003).
 *
 * Invariant 3 (§7.2) — "`nodes` holds records only when non-default
 * state exists" — is enforced here and nowhere else. Any reducer that
 * writes a node record must go through {@link withRecord}, otherwise
 * it leaves `{version:"1"}` husks behind that make the sidecar grow
 * without carrying information and break noop detection.
 */

import type {
	NodeAuthoringStateV1,
} from "@anvilkit/contracts/editor";
import type {
	AuthoringStateV1,
} from "./legacy/index.js";

/** The canonical empty record. */
export const EMPTY_RECORD: NodeAuthoringStateV1 = { version: "1" };

/** Read a node's record, falling back to the empty one. */
export function getRecord(
	state: AuthoringStateV1,
	nodeId: string,
): NodeAuthoringStateV1 {
	return state.nodes[nodeId] ?? EMPTY_RECORD;
}

/** True when a record carries nothing beyond its version marker. */
export function isDefaultRecord(record: NodeAuthoringStateV1): boolean {
	return Object.keys(record).every(
		(key) =>
			key === "version" ||
			(record as unknown as Record<string, unknown>)[key] === undefined,
	);
}

/**
 * Write a node record, dropping it when it has become default
 * (invariant 3). Reference-preserving: returns `state` unchanged when
 * the write is a no-op.
 */
export function withRecord(
	state: AuthoringStateV1,
	nodeId: string,
	record: NodeAuthoringStateV1,
): AuthoringStateV1 {
	const existing = state.nodes[nodeId];
	if (existing === record) {
		return state;
	}
	const nodes = { ...state.nodes };
	if (isDefaultRecord(record)) {
		if (existing === undefined) {
			return state;
		}
		delete nodes[nodeId];
	} else {
		nodes[nodeId] = record;
	}
	return { ...state, nodes };
}
