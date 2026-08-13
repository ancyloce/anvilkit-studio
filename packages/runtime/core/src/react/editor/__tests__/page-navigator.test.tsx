/**
 * `PageNavigator` — the §18 page list (PLAN-0020 CORE-P3-010;
 * ED-PAGE-001).
 *
 * The hook's guarantees are tested in `page-adapter.test.tsx`; this
 * covers the surface, where the risk is showing an author something
 * they cannot act on — an empty list with no adapter, or a create
 * button a read-only host would throw on.
 */

import type {
	EditorPageAdapter,
	EditorPageDescriptor,
} from "@anvilkit/contracts/editor";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorI18nProvider } from "@/state/editor-i18n-context";
import { createStudioEditorBridge } from "../bridge.js";
import { PageNavigator } from "../pages/PageNavigator.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";

const PAGES: readonly EditorPageDescriptor[] = [
	{ id: "p1", name: "Home" },
	{ id: "p2", name: "About" },
];

function show(
	adapter: EditorPageAdapter | undefined,
	activePageId?: string,
): void {
	const bridge = createStudioEditorBridge();
	bridge.editorConfig = adapter === undefined ? {} : { pageAdapter: adapter };
	render(
		<EditorI18nProvider>
			<StudioEditorBridgeContext value={bridge}>
				<PageNavigator
					{...(activePageId === undefined ? {} : { activePageId })}
				/>
			</StudioEditorBridgeContext>
		</EditorI18nProvider>,
	);
}

// `globals: false` in this preset means RTL auto-cleanup is off.
afterEach(() => {
	cleanup();
});

describe("PageNavigator", () => {
	it("renders nothing without a host adapter (§18)", () => {
		// Not an empty list — that reads as a broken feature.
		show(undefined);
		expect(screen.queryByTestId("ak-page-navigator")).toBeNull();
	});

	it("lists the host's pages", async () => {
		show({ list: async () => PAGES, open: async () => undefined });
		await waitFor(() =>
			expect(screen.getAllByTestId("ak-page-open")).toHaveLength(2),
		);
		expect(
			screen.getAllByTestId("ak-page-open").map((b) => b.dataset.pageId),
		).toEqual(["p1", "p2"]);
	});

	it("opens through the host adapter", async () => {
		const open = vi.fn(async () => undefined);
		show({ list: async () => PAGES, open });
		await waitFor(() =>
			expect(screen.getAllByTestId("ak-page-open")).toHaveLength(2),
		);
		fireEvent.click(screen.getAllByTestId("ak-page-open")[1] as HTMLElement);
		expect(open).toHaveBeenCalledWith("p2");
	});

	it("marks the active page for assistive tech", async () => {
		show({ list: async () => PAGES, open: async () => undefined }, "p2");
		await waitFor(() =>
			expect(screen.getAllByTestId("ak-page-open")).toHaveLength(2),
		);
		expect(
			screen.getAllByTestId("ak-page-open")[1]?.getAttribute("aria-current"),
		).toBe("page");
	});

	it("surfaces the host's own failure message", async () => {
		// "page service down" is actionable; "something went wrong" is not.
		show({
			list: async () => {
				throw new Error("page service down");
			},
			open: async () => undefined,
		});
		await waitFor(() =>
			expect(screen.getByTestId("ak-page-error").textContent).toBe(
				"page service down",
			),
		);
	});

	it("distinguishes an empty page set from a missing adapter", async () => {
		show({ list: async () => [], open: async () => undefined });
		await waitFor(() =>
			expect(screen.getByTestId("ak-page-empty")).toBeTruthy(),
		);
	});

	it("hides create when the host does not implement it", async () => {
		show({ list: async () => PAGES, open: async () => undefined });
		await waitFor(() =>
			expect(screen.getAllByTestId("ak-page-open")).toHaveLength(2),
		);
		// A read-only source must not render a button that would throw.
		expect(screen.queryByTestId("ak-page-create")).toBeNull();
	});

	it("creates a page and re-lists when the host supports it", async () => {
		const list = vi.fn(async () => PAGES);
		const create = vi.fn(async () => "p3");
		show({ list, open: async () => undefined, create });
		await waitFor(() =>
			expect(screen.getAllByTestId("ak-page-open")).toHaveLength(2),
		);

		fireEvent.change(screen.getByTestId("ak-page-new-name"), {
			target: { value: "Pricing" },
		});
		fireEvent.click(screen.getByTestId("ak-page-create"));

		await waitFor(() =>
			expect(create).toHaveBeenCalledWith({ name: "Pricing" }),
		);
		await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
	});
});

/** Keeps the JSX pragma satisfied under this preset. */
export type _Unused = ReactNode;
