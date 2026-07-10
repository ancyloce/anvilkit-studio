/**
 * @file Runtime tests for the 3.3 static-placeholder header-action
 * machinery: the generalized {@link composeHeaderActions} (now sorts
 * placeholders identically to live actions) and
 * {@link resolveHeaderActionSlots} (coalesce placeholders + live into one
 * ordered slot list keyed by id).
 *
 * Acceptance criteria covered:
 * - `composeHeaderActions` orders a placeholder list by `(group, order,
 *   id)` using the same comparator as live actions, so a placeholder and
 *   its eventual live action land in the same position (no layout shift).
 * - `resolveHeaderActionSlots`: a live action supersedes a same-id
 *   placeholder; a placeholder-only id renders as a placeholder slot; the
 *   merged list is sorted by the shared comparator.
 * - Duplicate ids *within* either input still throw.
 * - A placeholder + live action sharing an id is NOT a duplicate.
 */

import { describe, expect, it } from "vitest";
import { StudioPluginError } from "@/runtime/errors";
import {
	composeHeaderActions,
	resolveHeaderActionSlots,
} from "@/runtime/header-actions";
import type {
	StaticHeaderActionPlaceholder,
	StudioHeaderAction,
} from "@/types/plugin";

function makePlaceholder(
	id: string,
	options: {
		label?: string;
		group?: StudioHeaderAction["group"];
		order?: number;
		icon?: string;
	} = {},
): StaticHeaderActionPlaceholder {
	return {
		id,
		labelKey: options.label ?? id,
		...(options.icon !== undefined && { icon: options.icon }),
		...(options.group !== undefined && { group: options.group }),
		...(options.order !== undefined && { order: options.order }),
	};
}

function makeLive(
	id: string,
	options: {
		label?: string;
		group?: StudioHeaderAction["group"];
		order?: number;
	} = {},
): StudioHeaderAction {
	return {
		id,
		labelKey: options.label ?? id,
		...(options.group !== undefined && { group: options.group }),
		...(options.order !== undefined && { order: options.order }),
		onClick: () => undefined,
	};
}

describe("composeHeaderActions — placeholders sort like live actions", () => {
	it("orders placeholders by (group, order, id)", () => {
		const result = composeHeaderActions([
			makePlaceholder("z", { group: "overflow" }),
			makePlaceholder("a", { group: "primary" }),
			makePlaceholder("m", { group: "secondary", order: 50 }),
			makePlaceholder("b", { group: "secondary", order: 10 }),
		]).map((p) => p.id);
		expect(result).toEqual(["a", "b", "m", "z"]);
	});

	it("places a placeholder at the same index its live action would take", () => {
		const placeholderOrder = composeHeaderActions([
			makePlaceholder("publish", { group: "primary", order: 0 }),
			makePlaceholder("export", { group: "overflow", order: 10 }),
			makePlaceholder("save", { group: "secondary", order: 100 }),
		]).map((p) => p.id);
		const liveOrder = composeHeaderActions([
			makeLive("publish", { group: "primary", order: 0 }),
			makeLive("export", { group: "overflow", order: 10 }),
			makeLive("save", { group: "secondary", order: 100 }),
		]).map((a) => a.id);
		expect(placeholderOrder).toEqual(liveOrder);
	});

	it("still rejects duplicate ids within a placeholder list", () => {
		expect(() =>
			composeHeaderActions([makePlaceholder("dup"), makePlaceholder("dup")]),
		).toThrow(StudioPluginError);
	});
});

describe("resolveHeaderActionSlots", () => {
	it("renders a live action when one exists for the id (placeholder superseded)", () => {
		const slots = resolveHeaderActionSlots(
			[makePlaceholder("publish", { group: "primary" })],
			[makeLive("publish", { group: "primary" })],
		);
		expect(slots).toHaveLength(1);
		expect(slots[0]?.kind).toBe("live");
		expect(slots[0]?.action.id).toBe("publish");
	});

	it("renders a placeholder slot for an id with no live action yet", () => {
		const slots = resolveHeaderActionSlots(
			[makePlaceholder("history", { group: "secondary" })],
			[],
		);
		expect(slots).toHaveLength(1);
		expect(slots[0]?.kind).toBe("placeholder");
		expect(slots[0]?.action.id).toBe("history");
	});

	it("keeps the merged slots sorted by the shared (group, order, id) key", () => {
		const slots = resolveHeaderActionSlots(
			[
				makePlaceholder("assets", { group: "secondary", order: 20 }),
				makePlaceholder("publish", { group: "primary", order: 0 }),
			],
			[
				makeLive("save", { group: "secondary", order: 10 }),
				makeLive("download", { group: "overflow", order: 5 }),
			],
		);
		expect(slots.map((s) => s.action.id)).toEqual([
			"publish", // primary
			"save", // secondary order 10
			"assets", // secondary order 20 (placeholder)
			"download", // overflow
		]);
		// The live `save`/`download` are live; placeholders stay placeholders.
		expect(slots.map((s) => s.kind)).toEqual([
			"placeholder",
			"live",
			"placeholder",
			"live",
		]);
	});

	it("does NOT treat a placeholder + live action of the same id as a duplicate", () => {
		expect(() =>
			resolveHeaderActionSlots(
				[makePlaceholder("publish")],
				[makeLive("publish")],
			),
		).not.toThrow();
	});

	it("throws on duplicate ids within the live list", () => {
		expect(() =>
			resolveHeaderActionSlots([], [makeLive("dup"), makeLive("dup")]),
		).toThrow(StudioPluginError);
	});

	it("throws on duplicate ids within the placeholder list", () => {
		expect(() =>
			resolveHeaderActionSlots(
				[makePlaceholder("dup"), makePlaceholder("dup")],
				[],
			),
		).toThrow(StudioPluginError);
	});
});
