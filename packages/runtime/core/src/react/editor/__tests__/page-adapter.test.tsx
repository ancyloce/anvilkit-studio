/**
 * Host page navigation — the three §18 guarantees
 * (PLAN-0020 CORE-P3-010; ED-PAGE-001).
 *
 * Asserts the rules that are easy to regress silently: hidden without
 * an adapter, optional methods surfaced only when implemented, and
 * `open()` never routed through the command port (a page switch in
 * Puck history would make undo walk backwards through pages).
 */

import type {
	EditorPageAdapter,
	EditorPageDescriptor,
} from "@anvilkit/contracts/editor";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioEditorBridge } from "../bridge.js";
import { usePageAdapter } from "../pages/use-page-adapter.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";

const PAGES: readonly EditorPageDescriptor[] = [
	{ id: "p1", name: "Home" },
	{ id: "p2", name: "About" },
];

/**
 * Mirror the real lazy-runtime ordering: chrome renders against an
 * inert bridge first, then `EditorRoot` installs `editorConfig` in an
 * effect and notifies subscribers.
 */
function wrapperFor(
	adapter: EditorPageAdapter | undefined,
): (props: { children: ReactNode }) => ReactNode {
	const bridge = createStudioEditorBridge();
	return function LazyEditorConfig({ children }) {
		useEffect(() => {
			bridge.editorConfig =
				adapter === undefined ? {} : { pageAdapter: adapter };
			bridge.notifyStyles();
			return () => {
				bridge.editorConfig = null;
				bridge.notifyStyles();
			};
		}, []);
		return (
			<StudioEditorBridgeContext value={bridge}>
				{children}
			</StudioEditorBridgeContext>
		);
	};
}

afterEach(cleanup);

describe("usePageAdapter", () => {
	it("is hidden — null — when the host configured no adapter", () => {
		const { result } = renderHook(() => usePageAdapter(), {
			wrapper: wrapperFor(undefined),
		});
		expect(result.current).toBeNull();
	});

	it("lists pages from the host", async () => {
		const { result } = renderHook(() => usePageAdapter(), {
			wrapper: wrapperFor({
				list: async () => PAGES,
				open: async () => undefined,
			}),
		});
		await waitFor(() => expect(result.current?.status).toBe("ready"));
		expect(result.current?.pages.map((p) => p.id)).toEqual(["p1", "p2"]);
	});

	it("reports a failing host without throwing", async () => {
		const { result } = renderHook(() => usePageAdapter(), {
			wrapper: wrapperFor({
				list: async () => {
					throw new Error("page service down");
				},
				open: async () => undefined,
			}),
		});
		await waitFor(() => expect(result.current?.status).toBe("failed"));
		expect(result.current?.message).toBe("page service down");
	});

	it("opens through the host, never the command port", async () => {
		const open = vi.fn(async () => undefined);
		const { result } = renderHook(() => usePageAdapter(), {
			wrapper: wrapperFor({ list: async () => PAGES, open }),
		});
		await waitFor(() => expect(result.current?.status).toBe("ready"));

		await result.current?.open("p2");
		expect(open).toHaveBeenCalledWith("p2");
	});

	it("omits create and rename when the host does not implement them", async () => {
		const { result } = renderHook(() => usePageAdapter(), {
			wrapper: wrapperFor({
				list: async () => PAGES,
				open: async () => undefined,
			}),
		});
		await waitFor(() => expect(result.current?.status).toBe("ready"));
		// A UI cannot render an action that would throw on click.
		expect(result.current?.create).toBeUndefined();
		expect(result.current?.rename).toBeUndefined();
	});

	it("surfaces create and re-lists afterwards", async () => {
		const list = vi.fn(async () => PAGES);
		const create = vi.fn(async () => "p3");
		const { result } = renderHook(() => usePageAdapter(), {
			wrapper: wrapperFor({ list, open: async () => undefined, create }),
		});
		await waitFor(() => expect(result.current?.status).toBe("ready"));
		expect(list).toHaveBeenCalledTimes(1);

		const id = await result.current?.create?.("New");
		expect(id).toBe("p3");
		expect(create).toHaveBeenCalledWith({ name: "New" });
		await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
	});

	it("surfaces rename and re-lists afterwards", async () => {
		const list = vi.fn(async () => PAGES);
		const rename = vi.fn(async () => undefined);
		const { result } = renderHook(() => usePageAdapter(), {
			wrapper: wrapperFor({ list, open: async () => undefined, rename }),
		});
		await waitFor(() => expect(result.current?.status).toBe("ready"));

		await result.current?.rename?.("p1", "Landing");
		expect(rename).toHaveBeenCalledWith("p1", "Landing");
		await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
	});
});
