/**
 * @file Tests for ExternalField async list handling, plus the
 * 2026-05-17 review findings:
 *
 * - **P2** — seed `query` from `field.initialQuery`, `filters` from
 *   `field.initialFilters`, render `field.filterFields`, and pass the
 *   configured filters into `fetchList`.
 * - **M5** — debounce query → fetch and abort in-flight work.
 */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalField } from "@/overrides/fields/field-types/ExternalField";

afterEach(cleanup);

// biome-ignore lint/suspicious/noExplicitAny: test field fixtures are intentionally loose.
function renderField(field: any, props?: Record<string, unknown>) {
	return render(
		<ExternalField
			field={field}
			value={null}
			onChange={vi.fn()}
			name="entry"
			{...props}
		/>,
	);
}

function openPicker(): void {
	fireEvent.click(screen.getByRole("button", { name: /select/i }));
}

describe("ExternalField", () => {
	it("renders an error state when fetchList rejects", async () => {
		renderField({
			type: "external",
			fetchList: vi.fn().mockRejectedValue(new Error("offline")),
		});
		openPicker();
		expect(await screen.findByText("Could not load results")).toBeTruthy();
	});

	it("seeds the query from field.initialQuery", async () => {
		const fetchList = vi.fn().mockResolvedValue([]);
		renderField({ type: "external", initialQuery: "seeded", fetchList });
		openPicker();
		await waitFor(() => expect(fetchList).toHaveBeenCalled());
		expect(fetchList.mock.calls[0]?.[0]).toMatchObject({ query: "seeded" });
		// The search input reflects the seeded value.
		expect(screen.getByDisplayValue("seeded")).toBeTruthy();
	});

	it("seeds and forwards field.initialFilters to fetchList", async () => {
		const fetchList = vi.fn().mockResolvedValue([]);
		renderField({
			type: "external",
			initialFilters: { status: "published" },
			fetchList,
		});
		openPicker();
		await waitFor(() => expect(fetchList).toHaveBeenCalled());
		expect(fetchList.mock.calls[0]?.[0]).toMatchObject({
			filters: { status: "published" },
		});
	});

	it("renders filterFields and re-fetches with updated filters", async () => {
		const fetchList = vi.fn().mockResolvedValue([]);
		renderField({
			type: "external",
			filterFields: { category: { type: "text", label: "Category" } },
			fetchList,
		});
		openPicker();
		await waitFor(() => expect(fetchList).toHaveBeenCalled());

		const filterInput = screen.getByPlaceholderText("Category");
		fireEvent.change(filterInput, { target: { value: "news" } });

		await waitFor(() => {
			const last = fetchList.mock.calls.at(-1)?.[0];
			expect(last?.filters).toMatchObject({ category: "news" });
		});
	});

	it("debounces rapid typing into a single coalesced fetch", async () => {
		const fetchList = vi.fn().mockResolvedValue([]);
		renderField({ type: "external", fetchList });
		openPicker();
		await waitFor(() => expect(fetchList).toHaveBeenCalled());

		const input = screen.getByPlaceholderText("Search…");
		fireEvent.change(input, { target: { value: "a" } });
		fireEvent.change(input, { target: { value: "ab" } });
		fireEvent.change(input, { target: { value: "abc" } });

		await waitFor(() => {
			const queries = fetchList.mock.calls.map((c) => c[0].query);
			expect(queries).toContain("abc");
		});
		const queries = fetchList.mock.calls.map((c) => c[0].query);
		// Intermediate keystrokes were coalesced away by the debounce.
		expect(queries).not.toContain("a");
		expect(queries).not.toContain("ab");
		expect(queries.filter((q) => q === "abc")).toHaveLength(1);
	});

	it("aborts in-flight fetch work on unmount", async () => {
		let capturedSignal: AbortSignal | undefined;
		const fetchList = vi.fn(
			(params: { signal?: AbortSignal }) =>
				new Promise<unknown[]>(() => {
					capturedSignal = params.signal;
				}),
		);
		const { unmount } = renderField({ type: "external", fetchList });
		openPicker();
		await waitFor(() => expect(fetchList).toHaveBeenCalled());
		expect(capturedSignal?.aborted).toBe(false);
		unmount();
		expect(capturedSignal?.aborted).toBe(true);
	});

	it("renders rows with duplicate summaries without a duplicate-key warning (P2-5)", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
			/* swallow */
		});
		try {
			// Two results with identical summaries and NO id/key — the old
			// `summary` fallback produced colliding React keys.
			const fetchList = vi
				.fn()
				.mockResolvedValue([{ name: "Same" }, { name: "Same" }]);
			renderField({ type: "external", fetchList });
			openPicker();

			// Both rows render…
			await waitFor(() => {
				expect(screen.getAllByText("Same")).toHaveLength(2);
			});

			// …and React did not warn about duplicate keys.
			const dupKeyWarning = errorSpy.mock.calls.some((call) =>
				String(call[0] ?? "").includes("same key"),
			);
			expect(dupKeyWarning).toBe(false);
		} finally {
			errorSpy.mockRestore();
		}
	});
});
