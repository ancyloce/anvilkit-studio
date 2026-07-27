"use client";

/**
 * @file `AiProposalReviewMount` — the host-facing entry point for the
 * §21.2 review flow (PLAN-0020 CORE-P3-008; DD-DEC-014).
 *
 * `AiProposalDialog` needs an `EditorInspectorContext`, which is an
 * internal shape a host has no way to build. This mount reads it from
 * the live editor instead, so a host (or an AI plugin) only has to
 * supply the thing it actually owns: the proposal.
 *
 * Renders `null` when the editor runtime is not mounted or nothing is
 * selected — the same self-hiding rule the other editor surfaces use,
 * so a host can render this unconditionally.
 */

import type { ReactNode } from "react";
import type { EditorCommandProposal } from "../../../editor/index.js";
import { useEditorInspector } from "../inspector/use-inspector.js";
import { AiProposalDialog } from "./AiProposalDialog.js";

/** Props for {@link AiProposalReviewMount}. */
export interface AiProposalReviewMountProps {
	/** The proposal awaiting review, or `null` for "nothing pending". */
	readonly proposal: EditorCommandProposal | null;
	/** Called after a confirm commits, or when the author dismisses. */
	readonly onClose: () => void;
	/**
	 * Render the model's rationale. Off by default: §21.2 forbids
	 * exposing preview-data values, and rationale is model-authored
	 * prose that can quote whatever the model was shown.
	 */
	readonly includeRationale?: boolean;
}

/** Mount the §21.2 review dialog against the live editor. */
export function AiProposalReviewMount({
	proposal,
	onClose,
	includeRationale,
}: AiProposalReviewMountProps): ReactNode {
	const context = useEditorInspector();
	if (context === null || proposal === null) return null;
	return (
		<AiProposalDialog
			context={context}
			proposal={proposal}
			onClose={onClose}
			{...(includeRationale === undefined ? {} : { includeRationale })}
		/>
	);
}

/** The minimum a proposal author needs from the live editor. */
export interface EditorProposalInputs {
	/** Nodes currently selected, in selection order. */
	readonly selectedIds: readonly string[];
	/** The revision a proposal must be stamped with to be applicable. */
	readonly revision: number;
}

/**
 * Read the inputs needed to author an {@link EditorCommandProposal}.
 *
 * Deliberately narrow: an AI plugin or host needs the selection and the
 * revision, not the whole inspector context. Returns `null` when the
 * editor is not mounted.
 *
 * Callers must build the proposal **once**, when the model produces it,
 * and hold it. Rebuilding on every render would re-stamp
 * `expectedRevision` continuously and defeat §21.2's staleness
 * invalidation — the proposal would silently follow the document
 * instead of being refused when it moved on.
 */
export function useEditorProposalInputs(): EditorProposalInputs | null {
	const context = useEditorInspector();
	if (context === null) return null;
	return {
		selectedIds: context.selection.selectedIds,
		revision: context.revision,
	};
}
