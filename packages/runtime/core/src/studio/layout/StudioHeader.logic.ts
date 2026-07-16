import type { ComponentType } from "react";

import type {
	StudioPluginMeta,
	StudioPluginSlotContribution,
} from "@/types/plugin";

export function hasHeaderActionCapability(
	plugins: readonly StudioPluginMeta[],
): boolean {
	return plugins.some((meta) => meta.capabilities?.header === true);
}

export const COLLABORATORS_SLOT_ID = "collaborators";

export function selectCollaboratorsSlot(
	slots: ReadonlyMap<string, StudioPluginSlotContribution>,
): ComponentType | null {
	return slots.get(COLLABORATORS_SLOT_ID)?.component ?? null;
}

/**
 * Compact 4-state save-status model for the header chip (task Phase 2 —
 * replaces the old "Saved {relative}" text, which now lives only inside
 * `<PublishPanel>`). Priority order: an in-flight save always wins over a
 * stale error or a stale "saved" timestamp; an error persists until the
 * next save attempt (`isSavingDraft` or a fresh `lastSavedAt` clears it,
 * whichever the host reports first — the host owns `saveError`'s
 * lifecycle, this function only reads the current snapshot).
 */
export type SaveStatus = "saving" | "error" | "saved" | "unsaved";

export interface SaveStatusInputs {
	readonly isSavingDraft: boolean;
	readonly saveError: unknown;
	readonly lastSavedAt: Date | null;
}

export function deriveSaveStatus({
	isSavingDraft,
	saveError,
	lastSavedAt,
}: SaveStatusInputs): SaveStatus {
	if (isSavingDraft) return "saving";
	if (saveError !== undefined && saveError !== null) return "error";
	if (lastSavedAt !== null) return "saved";
	return "unsaved";
}
