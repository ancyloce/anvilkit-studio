/**
 * @file Tests for the shared `Windowed` primitive: it renders the full
 * list unchanged below its threshold and windows (renders ≪ total DOM
 * nodes) at/above it, in both `as="fragment"` and `as="ul"` modes.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Windowed } from "../windowed";

afterEach(cleanup);

function makeItems(n: number): { id: string }[] {
	return Array.from({ length: n }, (_, i) => ({ id: `i-${i}` }));
}

describe("Windowed — fragment mode", () => {
	it("renders every item and no virtualization viewport below threshold", () => {
		render(
			<div data-testid="container">
				<Windowed
					estimateSize={20}
					itemKey={(it) => it.id}
					items={makeItems(10)}
					renderItem={(it) => <span data-rowid={it.id}>{it.id}</span>}
					threshold={50}
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
				data-testid="win"
				estimateSize={20}
				itemKey={(it) => it.id}
				items={makeItems(total)}
				maxHeight={200}
				renderItem={(it) => <span data-rowid={it.id}>{it.id}</span>}
				threshold={50}
			/>,
		);
		expect(screen.getByTestId("win").getAttribute("data-virtualized")).toBe(
			"true",
		);
		expect(document.querySelectorAll("[data-rowid]").length).toBeLessThan(
			total,
		);
	});

	it("supports multi-lane grid windowing", () => {
		render(
			<Windowed
				data-testid="grid-win"
				estimateSize={80}
				itemKey={(it) => it.id}
				items={makeItems(600)}
				lanes={3}
				renderItem={(it) => <span data-rowid={it.id} />}
				threshold={50}
			/>,
		);
		expect(document.querySelectorAll("[data-rowid]").length).toBeLessThan(600);
	});
});

describe("Windowed — list mode (as='ul')", () => {
	it("owns the <ul> and wraps rows in <li> with ARIA position below threshold", () => {
		render(
			<Windowed
				aria-label="Things"
				as="ul"
				estimateSize={24}
				itemKey={(it) => it.id}
				items={makeItems(10)}
				renderItem={(it) => <button type="button">{it.id}</button>}
				threshold={50}
			/>,
		);
		const list = screen.getByRole("list", { name: "Things" });
		expect(list.tagName).toBe("UL");
		const rows = screen.getAllByRole("listitem");
		expect(rows).toHaveLength(10);
		expect(rows[0]?.getAttribute("aria-posinset")).toBe("1");
		expect(rows[0]?.getAttribute("aria-setsize")).toBe("10");
		expect(document.querySelector("[data-virtualized]")).toBeNull();
	});

	it("windows a large list into a bounded slice of <li> rows", () => {
		const total = 500;
		render(
			<Windowed
				aria-label="Things"
				as="ul"
				data-testid="list-win"
				estimateSize={24}
				itemKey={(it) => it.id}
				items={makeItems(total)}
				maxHeight={200}
				renderItem={(it) => <button type="button">{it.id}</button>}
				threshold={50}
			/>,
		);
		expect(
			screen.getByTestId("list-win").getAttribute("data-virtualized"),
		).toBe("true");
		expect(screen.getByRole("list", { name: "Things" }).tagName).toBe("UL");
		// jsdom reports no layout, so the virtualizer renders a small/zero
		// window — the point is it is never the full dataset.
		expect(screen.queryAllByRole("listitem").length).toBeLessThan(total);
	});

	it("accepts an activeIndex without throwing while virtualized", () => {
		expect(() =>
			render(
				<Windowed
					activeIndex={120}
					aria-label="Things"
					as="ul"
					estimateSize={24}
					itemKey={(it) => it.id}
					items={makeItems(200)}
					maxHeight={200}
					renderItem={(it) => <button type="button">{it.id}</button>}
					threshold={50}
				/>,
			),
		).not.toThrow();
	});
});
