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
