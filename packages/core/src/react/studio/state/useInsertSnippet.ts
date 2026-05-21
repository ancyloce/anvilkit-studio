/**
 * @file Snippet → canvas dispatch command for the `text` module.
 *
 * Returns a stable callback that, given a `StudioCopySnippet`, replaces
 * the `text` prop of the currently-selected canvas Text element with
 * the snippet body. Selection compatibility is re-checked at click
 * time (the row's `disabled` visual is for telegraphing, not gating —
 * the user might also reach the row via keyboard while a stale layout
 * is still rendering).
 *
 * Implementation uses Puck's `replace` action with the selector
 * returned by `getSelectorForId(id)`, so the dispatch correctly
 * targets nested zones without us walking `appState.data` ourselves.
 *
 * Failure modes — both surface a single warning toast keyed
 * `studio.module.text.requireSelection` rather than spamming the user
 * with implementation-specific copy:
 *   - No selection / non-Text selection / Text whose `text` prop is
 *     not a string.
 *   - Stale selector (selection moved between render and click).
 */

import {
	type ComponentData as PuckComponentData,
	useGetPuck,
} from "@puckeditor/core";
import { useCallback } from "react";
import { toast } from "sonner";
import type { StudioCopySnippet } from "@/types/sidebar";
import { useMsg } from "./editor-i18n-store";

export type InsertSnippetCommand = (snippet: StudioCopySnippet) => void;

function isCompatibleTextItem(
	item: PuckComponentData | null | undefined,
): boolean {
	if (item === null || item === undefined) return false;
	if (item.type !== "Text") return false;
	const props = item.props as { readonly text?: unknown };
	return typeof props.text === "string";
}

/**
 * Returns a stable callback that inserts the supplied snippet into the
 * currently-selected canvas Text element. No-op + warning toast when
 * no compatible selection exists.
 */
export function useInsertSnippet(): InsertSnippetCommand {
	const getPuck = useGetPuck();
	const msg = useMsg();

	return useCallback(
		(snippet: StudioCopySnippet) => {
			const snapshot = getPuck();
			const selected = snapshot.selectedItem ?? null;

			if (!isCompatibleTextItem(selected)) {
				toast.warning(msg("studio.module.text.requireSelection"));
				return;
			}

			// `selected` is non-null and Text-shaped — narrow it.
			const selectedItem = selected as PuckComponentData & {
				readonly props: { readonly id: string; readonly text: string };
			};
			const selectorId = selectedItem.props.id;
			const selector = snapshot.getSelectorForId(selectorId);
			if (selector === undefined) {
				// Race: selection moved or the node was removed between the
				// render that produced the snippet click and this dispatch.
				toast.warning(msg("studio.module.text.requireSelection"));
				return;
			}

			snapshot.dispatch({
				type: "replace",
				destinationIndex: selector.index,
				destinationZone: selector.zone,
				data: {
					...selectedItem,
					props: {
						...selectedItem.props,
						text: snippet.body,
					},
				},
			});
		},
		[getPuck, msg],
	);
}
