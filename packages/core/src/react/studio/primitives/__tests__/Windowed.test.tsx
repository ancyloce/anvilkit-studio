/**
 * @file Regression test for review finding M6: the shared `Windowed`
 * primitive renders the full list unchanged below its threshold and
 * windows (renders ≪ total DOM nodes) at/above it.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Windowed } from "@/primitives/windowed";

afterEach(cleanup);

function makeItems(n: number): { id: string }[] {
	return Array.from({ length: n }, (_, i) => ({ id: `i-${i}` }));
}

describe("Windowed", () => {
	it("renders every item and no virtualization viewport below threshold", () => {
		render(
			<div data-testid="container">
				<Windowed
					items={makeItems(10)}
					itemKey={(it) => it.id}
					estimateSize={20}
					threshold={50}
					renderItem={(it) => <span data-rowid={it.id}>{it.id}</span>}
				/>
			</div>,
		);
		expect(document.querySelectorAll("[data-rowid]")).toHaveLength(10);
		expect(document.querySelector("[data-virtualized]")).toBeNull();
	});

	it("windows a large list: far fewer rows than the dataset", () => {
		const total = 1000;
		render(
			<Windowed
				items={makeItems(total)}
				itemKey={(it) => it.id}
				estimateSize={20}
				threshold={50}
				maxHeight={200}
				data-testid="win"
				renderItem={(it) => <span data-rowid={it.id}>{it.id}</span>}
			/>,
		);
		expect(screen.getByTestId("win")).toBeTruthy();
		expect(screen.getByTestId("win").getAttribute("data-virtualized")).toBe(
			"true",
		);
		// Windowed: only a bounded slice is in the DOM. jsdom reports no
		// layout so the visible window is small/zero — the point is it
		// is never the full dataset.
		const rendered = document.querySelectorAll("[data-rowid]").length;
		expect(rendered).toBeLessThan(total);
	});

	it("supports multi-lane grid windowing", () => {
		render(
			<Windowed
				items={makeItems(600)}
				itemKey={(it) => it.id}
				estimateSize={80}
				lanes={3}
				threshold={50}
				data-testid="grid-win"
				renderItem={(it) => <span data-rowid={it.id} />}
			/>,
		);
		const rendered = document.querySelectorAll("[data-rowid]").length;
		expect(rendered).toBeLessThan(600);
	});
});
