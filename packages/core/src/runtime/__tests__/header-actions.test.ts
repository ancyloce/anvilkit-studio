/**
 * @file Runtime tests for `composeHeaderActions`.
 *
 * Acceptance criteria covered:
 * - Group precedence: `primary < secondary < overflow`.
 * - `order` ascending within a group; default `100` when omitted.
 * - `id` ascending as final tiebreaker (deterministic for ties on
 *   `(group, order)`).
 * - Default group (`secondary`) applied when `group` is omitted.
 * - Duplicate `id` across the input throws `StudioPluginError`.
 * - The input array is not mutated.
 * - Re-running `composeHeaderActions` on already-sorted input is a
 *   no-op (idempotent ordering).
 */

import { describe, expect, it } from "vitest";

import type { StudioHeaderAction } from "../../types/plugin.js";
import { StudioPluginError } from "../errors.js";
import { composeHeaderActions } from "../header-actions.js";

/**
 * Build a minimal valid {@link StudioHeaderAction}. The required
 * `label` and `onClick` are filled with cheap defaults so individual
 * tests only need to specify the fields they're asserting on.
 */
function makeAction(
	id: string,
	options: {
		label?: string;
		group?: StudioHeaderAction["group"];
		order?: number;
		icon?: string;
	} = {},
): StudioHeaderAction {
	return {
		id,
		label: options.label ?? id,
		...(options.icon !== undefined && { icon: options.icon }),
		...(options.group !== undefined && { group: options.group }),
		...(options.order !== undefined && { order: options.order }),
		onClick: () => undefined,
	};
}

describe("composeHeaderActions — group precedence", () => {
	it("primary comes before secondary which comes before overflow", () => {
		const result = composeHeaderActions([
			makeAction("a", { group: "overflow" }),
			makeAction("b", { group: "primary" }),
			makeAction("c", { group: "secondary" }),
		]);

		expect(result.map((action) => action.id)).toEqual(["b", "c", "a"]);
	});

	it("two-action acceptance criterion: primary beats overflow", () => {
		const result = composeHeaderActions([
			makeAction("a", { group: "overflow" }),
			makeAction("b", { group: "primary" }),
		]);

		expect(result.map((action) => action.id)).toEqual(["b", "a"]);
	});

	it("actions with no group default to secondary", () => {
		const result = composeHeaderActions([
			makeAction("ungrouped"),
			makeAction("primary-action", { group: "primary" }),
			makeAction("overflow-action", { group: "overflow" }),
		]);

		// primary < (secondary, the default for ungrouped) < overflow
		expect(result.map((action) => action.id)).toEqual([
			"primary-action",
			"ungrouped",
			"overflow-action",
		]);
	});
});

describe("composeHeaderActions — order field", () => {
	it("sorts ascending by order within the same group", () => {
		const result = composeHeaderActions([
			makeAction("c", { group: "primary", order: 300 }),
			makeAction("a", { group: "primary", order: 100 }),
			makeAction("b", { group: "primary", order: 200 }),
		]);

		expect(result.map((action) => action.id)).toEqual(["a", "b", "c"]);
	});

	it("default order (100) interleaves with explicit values", () => {
		const result = composeHeaderActions([
			makeAction("late", { group: "primary", order: 200 }),
			makeAction("default", { group: "primary" }), // 100
			makeAction("early", { group: "primary", order: 0 }),
		]);

		expect(result.map((action) => action.id)).toEqual([
			"early",
			"default",
			"late",
		]);
	});
});

describe("composeHeaderActions — id tiebreaker", () => {
	it("breaks ties on (group, order) by ascending id", () => {
		const result = composeHeaderActions([
			makeAction("zeta", { group: "primary", order: 100 }),
			makeAction("alpha", { group: "primary", order: 100 }),
			makeAction("mu", { group: "primary", order: 100 }),
		]);

		expect(result.map((action) => action.id)).toEqual([
			"alpha",
			"mu",
			"zeta",
		]);
	});

	it("yields a stable, deterministic order regardless of input order", () => {
		const a = makeAction("aa", { group: "secondary", order: 50 });
		const b = makeAction("bb", { group: "secondary", order: 50 });
		const c = makeAction("cc", { group: "secondary", order: 50 });

		const forwards = composeHeaderActions([a, b, c]).map((x) => x.id);
		const backwards = composeHeaderActions([c, b, a]).map((x) => x.id);
		const shuffled = composeHeaderActions([b, a, c]).map((x) => x.id);

		expect(forwards).toEqual(["aa", "bb", "cc"]);
		expect(backwards).toEqual(["aa", "bb", "cc"]);
		expect(shuffled).toEqual(["aa", "bb", "cc"]);
	});
});

describe("composeHeaderActions — purity", () => {
	it("does not mutate the input array", () => {
		const input: StudioHeaderAction[] = [
			makeAction("c", { group: "overflow" }),
			makeAction("a", { group: "primary" }),
			makeAction("b", { group: "secondary" }),
		];
		const inputSnapshot = input.map((action) => action.id);

		composeHeaderActions(input);

		expect(input.map((action) => action.id)).toEqual(inputSnapshot);
	});

	it("composing already-sorted input returns the same order", () => {
		const sorted = composeHeaderActions([
			makeAction("a", { group: "primary", order: 0 }),
			makeAction("b", { group: "primary", order: 100 }),
			makeAction("c", { group: "secondary", order: 0 }),
			makeAction("d", { group: "overflow", order: 0 }),
		]);

		const reSorted = composeHeaderActions(sorted);
		expect(reSorted.map((action) => action.id)).toEqual(
			sorted.map((action) => action.id),
		);
	});
});

describe("composeHeaderActions — duplicate detection", () => {
	it("throws StudioPluginError when two actions share an id", () => {
		expect(() =>
			composeHeaderActions([
				makeAction("publish", { group: "primary" }),
				makeAction("publish", { group: "secondary" }),
			]),
		).toThrowError(StudioPluginError);
	});

	it("the thrown error names the duplicated id", () => {
		try {
			composeHeaderActions([
				makeAction("publish"),
				makeAction("publish"),
			]);
			throw new Error("expected composeHeaderActions to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(StudioPluginError);
			if (error instanceof StudioPluginError) {
				expect(error.pluginId).toBe("publish");
				expect(error.message).toContain("publish");
			}
		}
	});
});
