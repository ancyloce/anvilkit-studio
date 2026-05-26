/**
 * @file Tests for {@link useActivePage} — the hook the header breadcrumb
 * uses to render the active page's title in place of "Untitled file".
 *
 * Covers: no source → `null` (so consumers keep their fallback), the row
 * marked `active: true` is returned, no active row → `null`, and the value
 * tracks live `subscribe()`-driven selection changes.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
	StudioPagesSourceProvider,
	useActivePage,
} from "@/context/pages-source";
import type { StudioPage, StudioPagesSource } from "@/types/pages";

function wrapperFor(source: StudioPagesSource | undefined) {
	return function Wrapper({ children }: { children: ReactNode }): ReactElement {
		return (
			<StudioPagesSourceProvider value={source}>
				{children}
			</StudioPagesSourceProvider>
		);
	};
}

const PAGES: readonly StudioPage[] = [
	{ id: "home", title: "Home", active: false },
	{ id: "about", title: "About", path: "/about", active: true },
	{ id: "blog", title: "Blog", path: "/blog", active: false },
];

describe("useActivePage", () => {
	it("returns null when no pages source is wired", () => {
		const { result } = renderHook(() => useActivePage(), {
			wrapper: wrapperFor(undefined),
		});
		expect(result.current).toBeNull();
	});

	it("returns the row marked active", async () => {
		const source: StudioPagesSource = { list: () => PAGES };
		const { result } = renderHook(() => useActivePage(), {
			wrapper: wrapperFor(source),
		});
		await waitFor(() => expect(result.current?.id).toBe("about"));
		expect(result.current?.title).toBe("About");
	});

	it("returns null when no row is active", async () => {
		const source: StudioPagesSource = {
			list: () => PAGES.map((page) => ({ ...page, active: false })),
		};
		const { result } = renderHook(() => useActivePage(), {
			wrapper: wrapperFor(source),
		});
		// Resolve the list, then assert nothing is selected.
		await waitFor(() => expect(result.current).toBeNull());
	});

	it("tracks live selection changes emitted via subscribe()", async () => {
		let activeId = "home";
		let listener: (() => void) | undefined;
		const source: StudioPagesSource = {
			list: () =>
				PAGES.map((page) => ({ ...page, active: page.id === activeId })),
			subscribe: (cb) => {
				listener = cb;
				return () => {
					listener = undefined;
				};
			},
		};
		const { result } = renderHook(() => useActivePage(), {
			wrapper: wrapperFor(source),
		});
		await waitFor(() => expect(result.current?.id).toBe("home"));

		// Host mutates + re-emits — the hook must re-run list() and surface
		// the newly active page.
		await act(async () => {
			activeId = "blog";
			listener?.();
		});
		await waitFor(() => expect(result.current?.id).toBe("blog"));
	});
});
