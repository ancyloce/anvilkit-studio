"use client";

/**
 * @file `useProposalReview` — the review-and-confirm binding for AI
 * proposals (PLAN-0020 CORE-P3-008; DD-DEC-014; DD-0019 §21.2).
 *
 * §21.2 steps 3–6: `preview()` returns a diff and validation errors,
 * the user reviews it, confirmed commands execute **through the normal
 * port**, and the result enters normal Puck history.
 *
 * ### One mutation path
 *
 * `confirm()` calls `commands.execute` — the same method the inspector
 * uses. It builds no data itself, holds no reducer, and has no bypass
 * for read-only or writer-gated documents, because it never touches
 * anything below the port. That is the whole of the plan's "MUST NOT
 * create a second mutation path" requirement: there is nothing here to
 * route around.
 *
 * A rejected proposal is never partially applied — assessment runs
 * before any execute, and a multi-command proposal is submitted as a
 * single `batch`, which the port commits all-or-nothing.
 */

import type {
	EditorError,
} from "@anvilkit/contracts/editor";
import type {
	EditorCommand,
} from "../../../editor/legacy/index.js";
import type {
	EditorCommandResult,
	EditorPreviewResult,
} from "../../../editor/legacy/index.js";
import { useCallback, useMemo, useState } from "react";
import {
	assessProposal,
	type EditorCommandProposal,
	type ProposalAssessment,
} from "../../../editor/index.js";
import type { EditorInspectorContext } from "../inspector/use-inspector.js";

/** What a review UI renders. */
export interface ProposalReview {
	readonly assessment: ProposalAssessment;
	/** Port-computed diff, or `null` while the proposal is unusable. */
	readonly preview: EditorPreviewResult | null;
	/** Validation errors from assessment and the port combined. */
	readonly errors: readonly EditorError[];
	/** Execute the proposal. Rejects to a result, never throws. */
	readonly confirm: () => Promise<EditorCommandResult | null>;
	/** True once {@link confirm} has committed this proposal. */
	readonly confirmed: boolean;
}

/**
 * Review one proposal against the live document.
 *
 * Re-assessed on every render against the current revision, so a
 * proposal that goes stale while the dialog is open stops being
 * confirmable without the UI needing its own invalidation logic.
 */
export function useProposalReview(
	context: EditorInspectorContext,
	proposal: EditorCommandProposal | null,
): ProposalReview | null {
	const { commands, revision } = context;
	const [confirmed, setConfirmed] = useState(false);

	const assessment = useMemo(
		() => (proposal === null ? null : assessProposal(proposal, revision)),
		[proposal, revision],
	);

	// Only previewed once assessment passes: previewing a stale or
	// over-cap proposal would show the author a diff they can never
	// apply.
	const preview = useMemo(() => {
		if (proposal === null || assessment?.status !== "ready") return null;
		return commands.preview(asSingleCommand(proposal));
	}, [proposal, assessment, commands]);

	const confirm = useCallback(async (): Promise<EditorCommandResult | null> => {
		if (proposal === null || assessment?.status !== "ready") return null;
		// The ordinary port — same entry point as an inspector edit, so
		// this lands in Puck history and is undoable (§21.2 step 6).
		const result = await commands.execute(asSingleCommand(proposal));
		if (result.status !== "rejected") setConfirmed(true);
		return result;
	}, [proposal, assessment, commands]);

	if (proposal === null || assessment === null) return null;

	return {
		assessment,
		preview,
		errors: [
			...(assessment.status === "rejected" ? assessment.errors : []),
			...(preview?.errors ?? []),
		],
		confirm,
		confirmed,
	};
}

/**
 * Collapse a proposal into one command.
 *
 * A single command is submitted as-is; several are wrapped in a
 * `batch` so the port's all-or-nothing commit applies to the proposal
 * as a whole. Executing them in a loop would let a mid-list rejection
 * leave the document half-changed with several history entries.
 */
function asSingleCommand(proposal: EditorCommandProposal): EditorCommand {
	const [only] = proposal.commands;
	if (proposal.commands.length === 1 && only !== undefined) return only;
	return {
		id: proposal.id,
		expectedRevision: proposal.expectedRevision,
		source: "ai",
		timestamp: Date.now(),
		type: "batch",
		commands: proposal.commands,
	} as EditorCommand;
}
