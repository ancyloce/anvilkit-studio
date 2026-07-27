/**
 * Render-time binding resolution (PLAN-0020 CORE-P3-006; ED-BIND-002;
 * DD-0019 §19; ADR 0006).
 *
 * The rules worth pinning are the ones that decide whether an author
 * can still reach their content: design mode never removes a node, and
 * an undecidable binding never hides one.
 */

import type { BindingV1, JsonValue } from "@anvilkit/contracts/editor";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
	BindingRenderProvider,
	type NodeBindingRender,
	useBindingRenderValue,
	useNodeBindingRender,
} from "../bindings/render-context.js";

// The react-library preset runs with `globals: false`, so RTL's
// auto-cleanup is OFF — multi-render suites stack DOM without this.
afterEach(() => {
	cleanup();
});

function binding(patch: Partial<BindingV1> = {}): BindingV1 {
	return {
		version: "1",
		id: "b1",
		nodeId: "n1",
		target: { type: "visibility" },
		expression: { type: "path", root: "data", path: ["show"] },
		...patch,
	};
}

/** Renders the resolved state for `n1` as inspectable JSON. */
function Probe(): ReactNode {
	const state = useNodeBindingRender("n1");
	return <div data-testid="probe">{JSON.stringify(state)}</div>;
}

function resolveFor(
	bindings: readonly BindingV1[],
	scope: { data?: JsonValue },
	preview: boolean,
): NodeBindingRender | null {
	render(
		<BindingRenderProvider
			bindings={Object.fromEntries(bindings.map((b) => [b.id, b]))}
			scope={scope}
			preview={preview}
		>
			<Probe />
		</BindingRenderProvider>,
	);
	const text = screen.getByTestId("probe").textContent ?? "null";
	return JSON.parse(text) as NodeBindingRender | null;
}

describe("BindingRenderProvider — visibility", () => {
	it("hides in preview when the condition is false", () => {
		const state = resolveFor([binding()], { data: { show: false } }, true);
		expect(state?.hiddenInPreview).toBe(true);
		expect(state?.previewMode).toBe(true);
	});

	it("keeps the node in design mode even when the condition is false", () => {
		// A node the author cannot select is a node they cannot repair.
		const state = resolveFor([binding()], { data: { show: false } }, false);
		expect(state?.hiddenInPreview).toBe(true);
		expect(state?.previewMode).toBe(false);
	});

	it("shows when the condition holds", () => {
		const state = resolveFor([binding()], { data: { show: true } }, true);
		expect(state?.hiddenInPreview).toBe(false);
	});

	it("never hides on an undecidable binding", () => {
		// Losing content because a data source hiccuped is worse than
		// showing it unfiltered.
		const state = resolveFor([binding()], { data: {} }, true);
		expect(state?.hiddenInPreview).toBe(false);
		expect(state?.indeterminate).toBe(true);
	});

	it("treats an absent host scope as indeterminate, not hidden", () => {
		// ADR 0006: no scope means the host has not filled it yet.
		const state = resolveFor([binding()], {}, true);
		expect(state?.hiddenInPreview).toBe(false);
		expect(state?.indeterminate).toBe(true);
	});

	it("refuses a blocked-key path without hiding the node", () => {
		const state = resolveFor(
			[
				binding({
					expression: { type: "path", root: "data", path: ["__proto__"] },
				}),
			],
			{ data: {} },
			true,
		);
		expect(state?.indeterminate).toBe(true);
		expect(state?.hiddenInPreview).toBe(false);
	});
});

describe("BindingRenderProvider — repeat", () => {
	const repeatBinding = binding({
		id: "r1",
		target: { type: "repeat", itemName: "row" },
		expression: { type: "path", root: "data", path: ["rows"] },
	});

	it("expands rows into render contexts with stable keys", () => {
		const state = resolveFor(
			[repeatBinding],
			{ data: { rows: [{ id: "a" }, { id: "b" }] } },
			false,
		);
		expect(state?.repeat?.map((c) => c.key)).toEqual(["a", "b"]);
		expect(state?.repeat?.map((c) => c.keySource)).toEqual(["field", "field"]);
	});

	it("falls back to index keys and flags the source", () => {
		const state = resolveFor(
			[repeatBinding],
			{ data: { rows: [{ name: "x" }] } },
			false,
		);
		expect(state?.repeat?.[0]?.keySource).toBe("index");
	});

	it("honours the author's limit", () => {
		const limited = binding({
			id: "r1",
			target: { type: "repeat", itemName: "row", limit: 2 },
			expression: { type: "path", root: "data", path: ["rows"] },
		});
		const state = resolveFor(
			[limited],
			{ data: { rows: [1, 2, 3, 4, 5] } },
			false,
		);
		expect(state?.repeat).toHaveLength(2);
	});

	it("yields zero rows for a missing collection rather than crashing", () => {
		const state = resolveFor([repeatBinding], { data: {} }, false);
		expect(state?.repeat).toEqual([]);
	});

	it("yields zero rows for a non-array collection", () => {
		const state = resolveFor(
			[repeatBinding],
			{ data: { rows: { not: "an array" } } },
			false,
		);
		expect(state?.repeat).toEqual([]);
	});
});

describe("BindingRenderProvider — nested row scope", () => {
	it("gives a repeated row its own item and index", () => {
		// A binding *inside* a row must read that row's record, not the
		// whole collection — otherwise every row renders identically.
		function RowProbe(): ReactNode {
			const value = useBindingRenderValue();
			return (
				<div data-testid="row-scope">
					{JSON.stringify({
						item: value?.scope.item,
						index: value?.scope.index,
					})}
				</div>
			);
		}

		render(
			<BindingRenderProvider
				// A real row always carries at least its repeat binding; an
				// empty map makes the provider inert by design.
				bindings={{ b1: binding() }}
				scope={{ data: { rows: [] }, item: { name: "second" }, index: 1 }}
				preview={false}
			>
				<RowProbe />
			</BindingRenderProvider>,
		);
		expect(
			JSON.parse(screen.getByTestId("row-scope").textContent ?? "{}"),
		).toEqual({ item: { name: "second" }, index: 1 });
	});
});

describe("BindingRenderProvider — inertness", () => {
	it("provides no lookup when the document has no bindings", () => {
		// Decorated renders must behave exactly as they did pre-Phase 3.
		const state = resolveFor([], { data: { show: true } }, true);
		expect(state).toBeNull();
	});

	it("returns null for a node with no bindings of its own", () => {
		render(
			<BindingRenderProvider
				bindings={{ b1: binding({ nodeId: "other" }) }}
				scope={{ data: { show: false } }}
				preview
			>
				<Probe />
			</BindingRenderProvider>,
		);
		expect(screen.getByTestId("probe").textContent).toBe("null");
	});
});
