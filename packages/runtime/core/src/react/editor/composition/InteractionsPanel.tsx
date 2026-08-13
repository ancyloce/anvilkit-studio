"use client";

/**
 * @file `InteractionsPanel` — the composition inspector's Interactions
 * tab (PLAN-0028 `p4-002`, PLAN-0026 §3.5).
 *
 * A rebase of `react/editor/interactions/InteractionsSection.tsx` onto
 * the canonical read/commit path, not a rewrite. The row vocabulary,
 * the trigger choices and the action form are the *same modules* the
 * old section uses — `interaction-summary.ts` and `ActionEditor.tsx` —
 * so the two surfaces cannot describe the same interaction differently
 * while both exist.
 *
 * What changes is the plumbing underneath: reads come from
 * {@link useNodeInteractions} (one projection of `appState.data`) and
 * writes from `useInteractionsCommit` (one functional `setData` per
 * intent, `recordHistory: true`). The old section's command dispatch,
 * its `bridge.port` cast and its async `busy` state are all gone —
 * a commit is synchronous and returns its own errors.
 *
 * ### The old section could list and create; this one can also remove
 *
 * That is not scope creep. The old section's own header records why it
 * was list-and-create only: "the frozen command union carries
 * `interaction.create` only, so this section lists and creates.
 * Editing or removing an interaction needs command members that do not
 * exist yet." The command union is not the write path any more — the
 * carrier commit takes an arbitrary updater over the node's
 * `Interaction[]` — so the constraint that produced that limitation no
 * longer exists, and the task's deliverable ("list, add, edit and
 * remove") is reachable without inventing anything.
 *
 * ### Honest states (§8.5 — the host may not fabricate support)
 *
 * - nothing selected → `studio.fields.empty`;
 * - a component that does not declare `interactions` →
 *   `studio.editor.inspector.tab.animation.empty`. **Not** a
 *   disabled-looking control: a control that would commit nothing is a
 *   worse answer than saying so.
 *
 * ### Why the label key says `animation`
 *
 * The shipped catalog names this tab `studio.editor.inspector.tab.
 * animation` ("Animation") and its empty state reads "This component
 * does not support interactions." — the key is named for the tab's
 * original framing, the string is about interactions. Both are reused
 * verbatim rather than re-keyed: minting
 * `…tab.interactions`/`…tab.interactions.empty` would add four catalog
 * entries (en/zh/ja/ko) expressing strings that already exist, which
 * `p4-008` explicitly forbids. Renaming the key is a catalog migration
 * and belongs with one, not here.
 */

import { type ReactNode, useState } from "react";
import { Button } from "@/primitives/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/primitives/select";
import { useMsg } from "@/state/editor-i18n-context";
import {
	type ActionDraft,
	ActionEditor,
	buildAction,
	EMPTY_ACTION_DRAFT,
} from "../interactions/ActionEditor.js";
import {
	summarizeInteraction,
	TRIGGER_CHOICES,
	triggerChoice,
} from "../interactions/interaction-summary.js";
import { usePageAdapter } from "../pages/use-page-adapter.js";
import type { StudioInspectorPanel } from "./inspector-panel.js";
import { useNodeInteractions } from "./interactions/use-node-interactions.js";

/** The Interactions tab body. Must render inside `<Puck>`. */
export function InteractionsPanel(): ReactNode {
	const msg = useMsg();
	const state = useNodeInteractions();
	const pageNav = usePageAdapter();
	const [draft, setDraft] = useState<ActionDraft>(EMPTY_ACTION_DRAFT);
	const [triggerId, setTriggerId] = useState("click");

	if (state.nodeId === null) {
		return (
			<p
				className="px-3 py-6 text-center text-[11px] text-[var(--ak-studio-muted-fg)]"
				data-testid="ak-interactions-panel-empty"
			>
				{msg("studio.fields.empty")}
			</p>
		);
	}

	if (!state.declared) {
		return (
			<p
				className="px-3 py-6 text-center text-[11px] text-[var(--ak-studio-muted-fg)]"
				data-testid="ak-interactions-panel-undeclared"
			>
				{msg("studio.editor.inspector.tab.animation.empty")}
			</p>
		);
	}

	const action = buildAction(draft);
	const choice = triggerChoice(triggerId);

	return (
		<div
			className="flex flex-col gap-3"
			data-testid="ak-interactions-panel"
			data-node-id={state.nodeId}
			data-interaction-count={state.rows.length}
		>
			<ul className="flex flex-col gap-1" data-testid="ak-interaction-list">
				{state.rows.map((row) => (
					<li
						key={row.interaction.id}
						data-testid={`ak-interaction-${row.interaction.id}`}
						data-effective-enabled={row.effectiveEnabled}
						data-missing-nodes={row.missingNodeIds.length}
						className="flex items-center justify-between gap-2 rounded border border-[var(--ak-studio-border)] px-2 py-1"
					>
						<span className="min-w-0 truncate text-[11px]">
							{summarizeInteraction(row.interaction)}
						</span>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							data-testid={`ak-interaction-remove-${row.interaction.id}`}
							onClick={() => state.removeInteraction(row.interaction.id)}
						>
							{msg("studio.editor.interaction.remove")}
						</Button>
					</li>
				))}
			</ul>

			<div className="flex flex-col gap-1">
				<Select
					value={triggerId}
					onValueChange={(next) => {
						if (typeof next === "string") setTriggerId(next);
					}}
				>
					<SelectTrigger
						data-testid="ak-interaction-trigger"
						className="h-7 text-[11px]"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{TRIGGER_CHOICES.map((entry) => (
							<SelectItem key={entry.id} value={entry.id}>
								{msg(entry.labelKey)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<ActionEditor
				draft={draft}
				onChange={setDraft}
				targets={state.targets}
				pages={pageNav?.pages ?? []}
				variantAxes={state.variantAxesFor(draft.targetNodeId || state.nodeId)}
			/>

			<Button
				type="button"
				size="sm"
				disabled={action === null}
				data-testid="ak-interaction-add"
				onClick={() => {
					if (action === null) return;
					state.addInteraction(msg(choice.labelKey), choice.trigger, action);
					setDraft(EMPTY_ACTION_DRAFT);
				}}
			>
				{msg("studio.editor.interaction.add")}
			</Button>

			{state.lastErrors.length > 0 ? (
				<ul
					className="flex flex-col gap-0.5"
					data-testid="ak-interaction-errors"
				>
					{state.lastErrors.map((error) => (
						<li
							key={error}
							className="text-[11px] text-[var(--ak-studio-danger-fg,#b42318)]"
						>
							{error}
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

/**
 * The roster entry `p4-009` registers. Exported from this file so the
 * promotion task wires the panel without editing it.
 */
export const INTERACTIONS_PANEL: StudioInspectorPanel = {
	id: "interactions",
	labelKey: "studio.editor.inspector.tab.animation",
	render: () => <InteractionsPanel />,
};
