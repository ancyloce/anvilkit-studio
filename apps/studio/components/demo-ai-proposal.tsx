"use client";

/**
 * @file `DemoAiProposal` — a deterministic stand-in for an AI plugin,
 * so the §21.2 review flow is reachable in the demo
 * (PLAN-0020 CORE-P3-008; DD-0019 §21.2).
 *
 * §21.2's flow starts with "the AI extension ... produces typed
 * commands". Core owns steps 3–6 (preview, review, confirm, undo) but
 * nothing in the demo produced a proposal, so the review dialog had no
 * way to appear and the acceptance scenario could not be executed
 * against `apps/studio`.
 *
 * This supplies step 2 **deterministically**: it locks the current
 * selection. A real model is not involved, and that is the point — the
 * scenario under test is the *review gate*, and a nondeterministic
 * proposal would make the spec flaky while testing nothing extra.
 *
 * The proposal is built **once**, on click, and held. Rebuilding it per
 * render would re-stamp `expectedRevision` continuously and defeat the
 * staleness invalidation §21.2 requires.
 *
 * ## NOT CURRENTLY MOUNTED — no slot exists for it
 *
 * This component is correct and typechecks, but the demo has nowhere to
 * render it. The only host slot inside the editor's provider tree is
 * `StudioProps.headerEnd`, which lands inside `SystemMenuTrigger`'s
 * `<Popover>`: its content is lazy (absent from the DOM until opened)
 * and **unmounts when the popover closes**, which would destroy the
 * review dialog mid-flow. Puck `overrides` are merged into `<Puck>`,
 * but the AnvilKit chrome replaces Puck's header, so those do not
 * render either.
 *
 * So the gap is a **host-extensibility** one, not an AI one: there is
 * no slot where a host or plugin can render persistent, editor-aware
 * chrome UI. Closing it is a product decision (a new slot, or an AI
 * plugin surface), not something to improvise for a demo — so this file
 * is left unwired as the reference implementation for whoever adds one.
 * Delete it if that route is not taken.
 */

import type { EditorCommandProposal } from "@anvilkit/core/editor";
import {
	AiProposalReviewMount,
	useEditorProposalInputs,
} from "@anvilkit/core/react/editor";
import { type ReactNode, useCallback, useState } from "react";

/**
 * A "Propose AI change" button plus the review dialog.
 *
 * Renders nothing when the editor runtime is absent, matching the
 * self-hiding convention of the editor's own surfaces.
 */
export function DemoAiProposal(): ReactNode {
	const inputs = useEditorProposalInputs();
	const [proposal, setProposal] = useState<EditorCommandProposal | null>(null);

	const propose = useCallback(() => {
		if (inputs === null || inputs.selectedIds.length === 0) return;
		setProposal({
			id: crypto.randomUUID(),
			title: "Lock the selected elements",
			rationale: "Demo proposal — locks whatever is selected.",
			expectedRevision: inputs.revision,
			requiresConfirmation: true,
			commands: [
				{
					id: crypto.randomUUID(),
					expectedRevision: inputs.revision,
					source: "ai",
					timestamp: Date.now(),
					type: "node.lock.set",
					nodeIds: [...inputs.selectedIds],
					locked: true,
				},
			],
		} as EditorCommandProposal);
	}, [inputs]);

	if (inputs === null) return null;

	return (
		<>
			<button
				type="button"
				onClick={propose}
				disabled={inputs.selectedIds.length === 0}
				data-testid="demo-ai-propose"
				className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-neutral-700"
			>
				Propose AI change
			</button>
			<AiProposalReviewMount
				proposal={proposal}
				onClose={() => setProposal(null)}
			/>
		</>
	);
}
