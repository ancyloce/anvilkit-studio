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
 * ## Mounted through `StudioProps.editorSlot`
 *
 * This used to be unwired: the only host slot inside the editor's
 * provider tree was `StudioProps.headerEnd`, which lands inside
 * `SystemMenuTrigger`'s `<Popover>` — lazy content that **unmounts
 * when the popover closes**, destroying the review dialog mid-flow.
 * Puck `overrides` are merged into `<Puck>`, but the AnvilKit chrome
 * replaces Puck's header, so those never render either.
 *
 * The gap was **host extensibility**, not AI, and core closed it with
 * `StudioProps.editorSlot` (CORE-P3-008): a persistent mount point
 * inside the editor's provider tree, beside the `<Puck>` subtree, that
 * lives as long as the editor runtime. `page.tsx` passes this
 * component there, so §32.4's review scenario is reachable in the app.
 *
 * Core imposes no layout on the slot, so this component positions its
 * own trigger.
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
			{/* The slot renders no wrapper, so the trigger positions
			    itself: fixed, above the chrome, out of the canvas. */}
			<button
				type="button"
				onClick={propose}
				disabled={inputs.selectedIds.length === 0}
				data-testid="demo-ai-propose"
				className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded border border-neutral-300 bg-white px-2 py-1 text-xs shadow-md disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
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
