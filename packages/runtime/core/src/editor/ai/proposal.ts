/**
 * @file AI command proposals — the pure half (PLAN-0020 CORE-P3-008;
 * DD-DEC-014; DD-0019 §21.2).
 *
 * §21.2's flow is: read a sanitized snapshot → produce typed commands
 * → `preview()` a diff → user reviews → confirmed commands execute
 * **through the normal port** → the result enters normal Puck history
 * and can be undone.
 *
 * ### The single-mutation-path rule
 *
 * The plan is explicit that this must not become a second way to
 * mutate the document beside the existing `compat/ai-host-adapter`.
 * That is enforced by omission: nothing in this module or its React
 * binding writes state. A proposal is *data* — a list of commands plus
 * the revision it was computed against — and the only thing that can
 * apply it is the same `EditorCommandPort.execute` an inspector edit
 * uses. There is no `applyProposal` here to misuse.
 *
 * ### Why staleness is checked rather than rebased
 *
 * A proposal is computed against a specific revision. If the document
 * moved on, the node ids it names may address different content, so
 * re-anchoring it would apply the model's intent to the wrong nodes.
 * §21.2 says a proposal "is invalid after its expected revision
 * changes", and this module treats that literally: stale proposals are
 * refused, never adjusted.
 */

import type {
	EditorError,
} from "@anvilkit/contracts/editor";
import type {
	EditorCommand,
} from "../legacy/index.js";
import { EDITOR_COUNT_LIMITS } from "@anvilkit/contracts/editor";
import { makeEditorError } from "../diagnostics.js";

/** A proposal awaiting review (DD-0019 §21.2, verbatim shape). */
export interface EditorCommandProposal {
	readonly id: string;
	readonly title: string;
	readonly rationale?: string;
	readonly commands: readonly EditorCommand[];
	readonly expectedRevision: number;
	/**
	 * Literal `true` — §22.4's "plugin and AI mutations require
	 * confirmation by default" is encoded in the type so a proposal
	 * that skips review cannot be constructed.
	 */
	readonly requiresConfirmation: true;
}

/** The §21.2 proposal caps. */
export const AI_PROPOSAL_LIMITS = {
	/** Commands per proposal — aligned with `commandsPerBatch`. */
	maxCommands: EDITOR_COUNT_LIMITS.commandsPerBatch,
	/** Distinct nodes a proposal may affect. */
	maxAffectedNodes: 500,
} as const;

/** Why a proposal cannot be offered for confirmation. */
export type ProposalRejection =
	| "stale-revision"
	| "too-many-commands"
	| "too-many-nodes"
	| "empty";

/** The outcome of checking a proposal against the live document. */
export type ProposalAssessment =
	| {
			readonly status: "ready";
			/** Nodes the proposal would touch, deduplicated. */
			readonly affectedNodeIds: readonly string[];
	  }
	| {
			readonly status: "rejected";
			readonly reason: ProposalRejection;
			readonly errors: readonly EditorError[];
	  };

/**
 * Node ids a command names.
 *
 * Reads only the shapes the frozen union actually declares. An unknown
 * command contributes nothing rather than being probed generically —
 * guessing at `nodeId`-ish keys would let a future command silently
 * escape the affected-node cap.
 */
export function commandNodeIds(command: EditorCommand): readonly string[] {
	const ids: string[] = [];
	const record = command as unknown as Record<string, unknown>;

	const single = record.nodeId;
	if (typeof single === "string") ids.push(single);

	for (const key of ["nodeIds", "instanceNodeIds"]) {
		const many = record[key];
		if (Array.isArray(many)) {
			for (const value of many) {
				if (typeof value === "string") ids.push(value);
			}
		}
	}

	if (command.type === "batch") {
		for (const member of command.commands) {
			ids.push(...commandNodeIds(member));
		}
	}
	return ids;
}

/**
 * Every distinct node a proposal would affect, in first-seen order.
 */
export function proposalAffectedNodeIds(
	proposal: EditorCommandProposal,
): readonly string[] {
	const seen = new Set<string>();
	for (const command of proposal.commands) {
		for (const id of commandNodeIds(command)) seen.add(id);
	}
	return [...seen];
}

/**
 * Assess a proposal against the document's current revision.
 *
 * Pure and total: returns a verdict, never throws, and never mutates.
 * A `ready` verdict is permission to *show* the diff — the user still
 * confirms before anything executes.
 */
export function assessProposal(
	proposal: EditorCommandProposal,
	currentRevision: number,
): ProposalAssessment {
	if (proposal.commands.length === 0) {
		return {
			status: "rejected",
			reason: "empty",
			errors: [
				makeEditorError("EDITOR_COMMAND_CONFLICT", "proposal has no commands", {
					details: { kind: "proposal", proposalId: proposal.id },
				}),
			],
		};
	}

	if (proposal.expectedRevision !== currentRevision) {
		// Never rebased — see the file header.
		return {
			status: "rejected",
			reason: "stale-revision",
			errors: [
				makeEditorError(
					"EDITOR_COMMAND_CONFLICT",
					`proposal was computed against revision ${proposal.expectedRevision} but the document is at ${currentRevision}`,
					{
						details: {
							kind: "proposal",
							proposalId: proposal.id,
							expectedRevision: proposal.expectedRevision,
							currentRevision,
						},
					},
				),
			],
		};
	}

	if (proposal.commands.length > AI_PROPOSAL_LIMITS.maxCommands) {
		return {
			status: "rejected",
			reason: "too-many-commands",
			errors: [
				makeEditorError(
					"EDITOR_LIMIT_EXCEEDED",
					`proposal carries ${proposal.commands.length} commands, above the ${AI_PROPOSAL_LIMITS.maxCommands} limit`,
					{
						details: {
							kind: "proposal",
							proposalId: proposal.id,
							limit: AI_PROPOSAL_LIMITS.maxCommands,
						},
					},
				),
			],
		};
	}

	const affectedNodeIds = proposalAffectedNodeIds(proposal);
	if (affectedNodeIds.length > AI_PROPOSAL_LIMITS.maxAffectedNodes) {
		return {
			status: "rejected",
			reason: "too-many-nodes",
			errors: [
				makeEditorError(
					"EDITOR_LIMIT_EXCEEDED",
					`proposal affects ${affectedNodeIds.length} nodes, above the ${AI_PROPOSAL_LIMITS.maxAffectedNodes} limit`,
					{
						details: {
							kind: "proposal",
							proposalId: proposal.id,
							limit: AI_PROPOSAL_LIMITS.maxAffectedNodes,
						},
					},
				),
			],
		};
	}

	return { status: "ready", affectedNodeIds };
}

/**
 * Strip a proposal to what is safe to render in a review UI.
 *
 * §21.2: a proposal "may not expose secrets or preview-data values in
 * its diff". `rationale` is model-authored prose that can quote
 * whatever the model was shown — including preview rows — so it is
 * dropped unless the caller opts in. Titles are kept because a review
 * dialog is unusable without one, and truncated so a model cannot use
 * the field as an exfiltration channel.
 */
export function sanitizeProposalForDisplay(
	proposal: EditorCommandProposal,
	options: { readonly includeRationale?: boolean } = {},
): {
	readonly id: string;
	readonly title: string;
	readonly rationale?: string;
} {
	const title = proposal.title.slice(0, MAX_TITLE_LENGTH);
	if (options.includeRationale !== true || proposal.rationale === undefined) {
		return { id: proposal.id, title };
	}
	return {
		id: proposal.id,
		title,
		rationale: proposal.rationale.slice(0, MAX_RATIONALE_LENGTH),
	};
}

const MAX_TITLE_LENGTH = 200;
const MAX_RATIONALE_LENGTH = 2_000;
