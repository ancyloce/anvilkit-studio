"use client";

/**
 * @file `AiProposalDialog` — review / confirm / undo for AI proposals
 * (PLAN-0020 CORE-P3-008; DD-DEC-014; DD-0019 §21.2).
 *
 * §21.2 step 4 is "the user reviews the diff", and this is that step.
 * The dialog is the confirmation gate `requiresConfirmation: true`
 * exists to force, so it is deliberately modal: an AI edit must not be
 * something an author dismisses by clicking elsewhere.
 *
 * ### What is shown, and what is not
 *
 * The diff summary is **counts and node ids**, never content. §21.2
 * forbids exposing secrets or preview-data values, and the model's
 * `rationale` can quote whatever it was shown — so it is rendered only
 * through `sanitizeProposalForDisplay`, which drops it unless the host
 * opts in and truncates what remains.
 *
 * Undo is not a button here. Confirmed commands go through the normal
 * port into normal Puck history (§21.2 step 6), so the editor's
 * existing Undo *is* the undo affordance; adding a second one would
 * imply a separate history this flow does not have.
 */

import { type ReactNode, useState } from "react";
import { Button } from "@/primitives/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/primitives/dialog";
import { useMsg } from "@/state/editor-i18n-context";
import {
	type EditorCommandProposal,
	sanitizeProposalForDisplay,
} from "../../../editor/index.js";
import { editorErrorMessageKey } from "../error-messages.js";
import type { EditorInspectorContext } from "../inspector/use-inspector.js";
import { useProposalReview } from "./use-proposal.js";

/** Props for {@link AiProposalDialog}. */
export interface AiProposalDialogProps {
	readonly context: EditorInspectorContext;
	/** The proposal awaiting review, or `null` to close the dialog. */
	readonly proposal: EditorCommandProposal | null;
	/** Called after a confirm commits, or when the author dismisses. */
	readonly onClose: () => void;
	/**
	 * Show the model's rationale. Off by default — see the file header.
	 */
	readonly includeRationale?: boolean;
}

/** The §21.2 review-and-confirm dialog. */
export function AiProposalDialog({
	context,
	proposal,
	onClose,
	includeRationale,
}: AiProposalDialogProps): ReactNode {
	const msg = useMsg();
	const review = useProposalReview(context, proposal);
	const [busy, setBusy] = useState(false);

	if (proposal === null || review === null) return null;

	const safe = sanitizeProposalForDisplay(proposal, {
		...(includeRationale === undefined ? {} : { includeRationale }),
	});
	const ready = review.assessment.status === "ready";
	const affected = ready ? review.assessment.affectedNodeIds : [];

	async function onConfirm(): Promise<void> {
		if (busy) return;
		setBusy(true);
		try {
			const result = await review?.confirm();
			if (result !== null && result?.status !== "rejected") onClose();
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent data-testid="ak-ai-proposal-dialog">
				<DialogHeader>
					<DialogTitle data-testid="ak-ai-proposal-title">
						{safe.title}
					</DialogTitle>
					<DialogDescription>
						{msg("studio.editor.ai.reviewDescription")}
					</DialogDescription>
				</DialogHeader>

				{safe.rationale !== undefined ? (
					<p
						className="text-[11px] text-[var(--ak-studio-muted-fg)]"
						data-testid="ak-ai-proposal-rationale"
					>
						{safe.rationale}
					</p>
				) : null}

				<dl className="grid grid-cols-2 gap-1 text-[11px]">
					<dt>{msg("studio.editor.ai.commandCount")}</dt>
					<dd data-testid="ak-ai-proposal-commands">
						{proposal.commands.length}
					</dd>
					<dt>{msg("studio.editor.ai.affectedNodes")}</dt>
					<dd data-testid="ak-ai-proposal-nodes">{affected.length}</dd>
				</dl>

				{review.errors.length > 0 ? (
					<ul
						className="text-[11px] text-[var(--ak-studio-danger-fg,#b42318)]"
						data-testid="ak-ai-proposal-errors"
					>
						{review.errors.map((error) => (
							// Localized author-facing text keyed off the frozen error
							// code; the engine's English `message` is the fallback and
							// the developer-facing detail (EP-23: no unlocalized
							// strings in shipped editor surfaces). `title` keeps the
							// raw message reachable without rendering it as the label.
							<li
								key={`${error.code}:${error.message}`}
								title={error.message}
								data-error-code={error.code}
							>
								{msg(editorErrorMessageKey(error.code), error.message)}
							</li>
						))}
					</ul>
				) : null}

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onClose}
						data-testid="ak-ai-proposal-cancel"
					>
						{msg("studio.editor.ai.cancel")}
					</Button>
					<Button
						type="button"
						size="sm"
						// A stale or over-cap proposal can never be confirmed —
						// the gate is the assessment, not the button's styling.
						disabled={!ready || busy}
						onClick={() => {
							void onConfirm();
						}}
						data-testid="ak-ai-proposal-confirm"
					>
						{msg("studio.editor.ai.confirm")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
