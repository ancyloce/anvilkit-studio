/**
 * @file The interactions editor's pure presentation helpers — the
 * trigger vocabulary, the one-line summary, and the default name a new
 * interaction gets (PLAN-0028 `p4-002`).
 *
 * Extracted from `InteractionsSection.tsx` **unchanged in behaviour**.
 * The composition `InteractionsPanel` is a rebase of that surface onto
 * the canonical read/commit path, and these three pieces are the parts
 * of it that are pure and carry the authored UX decisions: which
 * triggers are offered (each already complete per DD-0019 §16, so the
 * picker cannot emit a bare type the schema rejects), how a row reads
 * at a glance, and what an unnamed interaction is called. Duplicating
 * them would let the two surfaces drift apart while both still
 * compiled, which is exactly the class of divergence this file removes.
 *
 * React-free: everything here is a value or a string.
 */

import type {
	Interaction,
	InteractionTrigger,
} from "@anvilkit/contracts/editor";
import type { ActionDraft } from "./ActionEditor.js";

/** One entry in the trigger picker. */
export interface InteractionTriggerChoice {
	readonly id: string;
	/** A `studio.*` catalog key — inline strings are prohibited. */
	readonly labelKey: string;
	readonly trigger: InteractionTrigger;
}

/**
 * The trigger choices offered by the picker.
 *
 * §32.4 exercises click, hover and viewport, and each carries the extra
 * members §16 makes mandatory (`phase`, `threshold`) — so the picker
 * emits complete triggers rather than a bare type the schema rejects.
 */
export const TRIGGER_CHOICES: readonly InteractionTriggerChoice[] = [
	{
		id: "click",
		labelKey: "studio.editor.interaction.trigger.click",
		trigger: { type: "click" },
	},
	{
		id: "hover",
		labelKey: "studio.editor.interaction.trigger.hover",
		trigger: { type: "hover", phase: "enter" },
	},
	{
		id: "viewport",
		labelKey: "studio.editor.interaction.trigger.viewport",
		trigger: { type: "viewport", phase: "enter", threshold: 0.5 },
	},
];

/** The choice for `id`, falling back to click. */
export function triggerChoice(id: string): InteractionTriggerChoice {
	return (
		TRIGGER_CHOICES.find((entry) => entry.id === id) ?? {
			id: "click",
			labelKey: "studio.editor.interaction.trigger.click",
			trigger: { type: "click" },
		}
	);
}

/** A one-line human summary of what an interaction does. */
export function summarizeInteraction(interaction: Interaction): string {
	const action = interaction.actions[0];
	const rest =
		interaction.actions.length > 1 ? ` +${interaction.actions.length - 1}` : "";
	if (action === undefined) return `${interaction.trigger.type} → —${rest}`;
	const target =
		action.type === "url"
			? action.url
			: action.type === "navigate"
				? action.pageId
				: action.type === "animate"
					? action.targetNodeIds.join(", ")
					: action.targetNodeId;
	return `${interaction.trigger.type} → ${action.type} ${target}${rest}`;
}

/**
 * A default interaction name.
 *
 * Authors rename interactions later; what matters here is that a list
 * of six actions is distinguishable at a glance, which the family plus
 * its subject gives cheaply.
 */
export function describeActionDraft(draft: ActionDraft): string {
	switch (draft.kind) {
		case "url":
			return draft.url.trim();
		case "navigate":
			return `Go to ${draft.pageId.trim()}`;
		case "scroll":
			return "Scroll to element";
		case "visibility":
			return `${draft.visibility} element`;
		case "variant":
			return `Set ${draft.axisId} to ${draft.optionId}`;
		default:
			return `Animate ${draft.property}`;
	}
}
