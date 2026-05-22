/**
 * @file Tests for the `selectCollaboratorsSlot` resolver that powers the
 * collaborator-avatar anchor in `<StudioHeader>`. The resolver is
 * exported so the slot-id contract can be exercised in isolation without
 * mounting the full chrome (which would require i18n / runtime /
 * plugin-context providers).
 *
 * Covers: an empty slot map resolves to `null`, a contribution under the
 * canonical `"collaborators"` id resolves to that component, and an
 * unrelated slot id is ignored. `@anvilkit/collab-ui` is the production
 * filler of this slot (via `createCollabPlugin()`); core never imports it.
 */

import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import {
	COLLABORATORS_SLOT_ID,
	selectCollaboratorsSlot,
} from "@/layout/StudioHeader";
import type { StudioPluginSlotContribution } from "@/types/plugin";

const Noop: ComponentType = () => null;

function slotMap(
	entries: ReadonlyArray<readonly [string, ComponentType]>,
): ReadonlyMap<string, StudioPluginSlotContribution> {
	return new Map(entries.map(([id, component]) => [id, { id, component }]));
}

describe("selectCollaboratorsSlot", () => {
	it("resolves to null when no plugin fills the collaborators slot", () => {
		expect(selectCollaboratorsSlot(new Map())).toBeNull();
	});

	it("resolves the component contributed under the collaborators slot id", () => {
		const slots = slotMap([[COLLABORATORS_SLOT_ID, Noop]]);
		expect(selectCollaboratorsSlot(slots)).toBe(Noop);
	});

	it("ignores unrelated slot ids", () => {
		const slots = slotMap([["something-else", Noop]]);
		expect(selectCollaboratorsSlot(slots)).toBeNull();
	});
});
