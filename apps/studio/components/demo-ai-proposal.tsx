"use client";

/**
 * @file `DemoAiProposal` — a deterministic stand-in for an AI plugin,
 * rebased onto the canonical intent surface (PLAN-0028 `p6-004`;
 * PLAN-0026 §3.4, §1 rule 5).
 *
 * ## What an AI proposal is now
 *
 * `p3-008` replaced the editor's command-dispatch surface with
 * `EditorApi = { readDocument(), subscribe(), commit.* }` plus a small
 * typed `EditorIntent` union. An intent is a **request**, not an IR:
 * the host resolves it with `resolveEditorIntent(api, intent)`, which
 * turns it into exactly one commit-helper call and returns the
 * outcome. Nothing is queued, nothing is serialized, and nothing about
 * the intent vocabulary is ever written into `Data` — which is what
 * keeps this contract-legal under rule 5 and is precisely what
 * distinguishes it from the command IR being deleted.
 *
 * The reference app is where a reader looks to see that distinction,
 * so this component deliberately shows the whole shape: build one
 * intent, hold it for review, resolve it on confirm, and render the
 * outcome — including a refusal.
 *
 * ## The proposal is built once, on click
 *
 * Rebuilding per render would re-address whatever happens to be
 * selected at paint time, which is the opposite of the staleness
 * behaviour under test. The intent captures the node id it was
 * generated against and holds it; `resolveEditorIntent` re-checks that
 * id against the **current** projection at apply time.
 *
 * ## Stale selection is surfaced, never swallowed
 *
 * An AI regenerate applied against a selection the document has since
 * moved past is a recorded live failure mode in this repo. `p3-008`
 * closes it by rejecting rather than applying to a neighbour; this
 * component's job is to make that rejection **visible** — the outcome
 * panel renders the diagnostic verbatim, with `role="alert"`, instead
 * of logging it and appearing to do nothing.
 *
 * ## Why this renders inside `<Puck>`
 *
 * `EditorApi` is built from the live `PuckApi`, and every public route
 * to one (`useGetPuck`, `useDocumentModel`, the commit hooks) requires
 * the Puck provider. `StudioProps.editorSlot` mounts **beside** the
 * `<Puck>` subtree, not inside it (`StudioEditorMount` wraps `<Puck>`),
 * so the slot cannot reach the API this surface now writes through.
 * {@link demoAiProposalOverrides} therefore mounts it through the
 * consumer `puck` override instead — the same seam
 * `lib/collab-studio-plugin.tsx` uses, composed *around* the AnvilKit
 * chrome rather than replacing it, and just as persistent: it lives as
 * long as the Puck subtree, so no popover or rail-tab change can
 * unmount a review mid-flow.
 *
 * The override object is module-scope on purpose. `mergedOverrides` in
 * `use-studio-controller.ts` memoizes on the consumer `overrides`
 * identity, so an inline literal would remount the whole chrome on
 * every render of the host page.
 */

import {
	createEditorApi,
	resolveEditorIntent,
	useShellSelection,
} from "@anvilkit/core/react/editor";
import type {
	EditorApi,
	EditorIntent,
	EditorIntentOutcome,
} from "@anvilkit/core/types";
import { Button } from "@anvilkit/ui";
import type { PuckApi, Overrides as PuckOverrides } from "@puckeditor/core";
import { createUsePuck, useGetPuck } from "@puckeditor/core";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

// Resolved against the app's own `@puckeditor/core` — the copy
// `<Studio>` mounts — so the hook and the provider are one module
// instance. Same reason `lib/collab-studio-plugin.tsx` inlines its own.
const useDemoPuck = createUsePuck();

/** One held proposal: the human-readable framing plus the intent. */
interface DemoProposal {
	readonly title: string;
	readonly rationale: string;
	readonly intent: EditorIntent;
}

/**
 * A "Propose AI change" button, a review gate, and the resolved
 * outcome.
 *
 * The trigger is disabled rather than hidden with nothing selected, so
 * the affordance stays discoverable and its precondition is legible.
 * The review panel and the outcome each appear only when there is one.
 */
export function DemoAiProposal(): ReactNode {
	const getPuck = useGetPuck();
	const selection = useShellSelection();
	// The change signal for `EditorApi.subscribe`. A reference
	// subscription on `appState.data`, deliberately NOT a second
	// `useDocumentModel()` projection: the document is read through
	// `api.readDocument()` at the two moments it is actually needed, so
	// this surface costs one reference comparison per edit rather than a
	// standing whole-document walk.
	const data = useDemoPuck((state) => state.appState.data);
	const [proposal, setProposal] = useState<DemoProposal | null>(null);
	const [outcome, setOutcome] = useState<EditorIntentOutcome | null>(null);

	const listeners = useRef<Set<() => void>>(new Set());
	useEffect(() => {
		// `data` IS the signal, not an input: a new document reference
		// means the document moved, which is what a subscriber waits for.
		void data;
		for (const listener of listeners.current) listener();
	}, [data]);

	const api = useMemo<EditorApi>(
		() =>
			createEditorApi({
				getPuckApi: getPuck as unknown as () => PuckApi,
				subscribe: (listener) => {
					const set = listeners.current;
					set.add(listener);
					return () => {
						set.delete(listener);
					};
				},
			}),
		[getPuck],
	);

	const primaryId = selection.primaryId;

	const propose = useCallback((): void => {
		if (primaryId === null) return;
		// The canonical read surface — the same projection the resolver
		// re-checks against at apply time.
		const node = api.readDocument().nodes.get(primaryId);
		if (node === undefined) return;
		setOutcome(null);
		// Deterministic on purpose: the subject under test is the review
		// gate and the resolver, not a model. A nondeterministic proposal
		// would make the flow unreproducible while proving nothing extra.
		const name = `AI: ${node.type}`;
		setProposal({
			title: `Rename this ${node.type} to “${name}”`,
			rationale:
				"Demo proposal — renames whatever was selected when it was generated.",
			intent: { kind: "rename-node", nodeId: primaryId, name },
		});
	}, [api, primaryId]);

	const apply = useCallback((): void => {
		if (proposal === null) return;
		// The host resolver, not a dispatch: one intent in, one
		// commit-helper call, one history entry, one outcome out.
		setOutcome(resolveEditorIntent(api, proposal.intent));
		setProposal(null);
	}, [api, proposal]);

	const dismiss = useCallback((): void => {
		setProposal(null);
		setOutcome(null);
	}, []);

	return (
		// The container is a fixed-position column, so it must not eat
		// canvas clicks in the strip it spans — only its actual children do.
		<div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-80 -translate-x-1/2 flex-col gap-2">
			<Button
				type="button"
				size="sm"
				variant="outline"
				onClick={propose}
				disabled={primaryId === null}
				data-testid="demo-ai-propose"
				className="pointer-events-auto self-center shadow-md"
			>
				Propose AI change
			</Button>

			{proposal === null ? null : (
				<div
					data-testid="demo-ai-proposal-review"
					className="pointer-events-auto rounded border border-border bg-background p-2 text-xs shadow-md"
				>
					<p className="font-medium">{proposal.title}</p>
					<p className="mt-1 text-muted-foreground">{proposal.rationale}</p>
					<div className="mt-2 flex gap-2">
						<Button
							type="button"
							size="xs"
							onClick={apply}
							data-testid="demo-ai-proposal-apply"
						>
							Apply
						</Button>
						<Button
							type="button"
							size="xs"
							variant="ghost"
							onClick={dismiss}
							data-testid="demo-ai-proposal-dismiss"
						>
							Dismiss
						</Button>
					</div>
				</div>
			)}

			{outcome === null ? null : (
				<p
					// A refusal the author cannot see is worse than no
					// refusal at all: it reads as "nothing happened", and the
					// recorded failure mode is exactly a retry loop on that.
					role="alert"
					data-testid="demo-ai-proposal-outcome"
					data-status={outcome.status}
					className={
						outcome.status === "rejected"
							? "pointer-events-auto rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-destructive text-xs shadow-md"
							: "pointer-events-auto rounded border border-border bg-background px-2 py-1 text-muted-foreground text-xs shadow-md"
					}
				>
					{outcome.status === "committed"
						? "Applied as one history entry — undo reverts it."
						: outcome.status === "noop"
							? "Nothing to change; the document already matches the proposal."
							: `Proposal refused — ${outcome.errors
									.map((error) => error.message)
									.join(" ")}`}
				</p>
			)}
		</div>
	);
}

/**
 * Mount {@link DemoAiProposal} inside the `<Puck>` subtree.
 *
 * Composed **around** the chrome: `mergeOverrides` puts the consumer's
 * override outermost, so `children` here is core's own `puck` slot
 * output and this wrapper adds to it rather than replacing it.
 */
export const demoAiProposalOverrides: Partial<PuckOverrides> = {
	puck: ({ children }) => (
		<>
			{children}
			<DemoAiProposal />
		</>
	),
};
