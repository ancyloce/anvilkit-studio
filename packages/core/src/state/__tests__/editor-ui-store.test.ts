/**
 * @file Tests for `createEditorUiStore` — storeId namespacing,
 * persistence boundaries, and `drawerSearch` exclusion (PRD §7.4).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createEditorUiStore } from "@/state/slices/editor-ui-store";

interface PersistableStoreApi {
	readonly persist: {
		rehydrate(): Promise<void>;
		clearStorage(): void;
	};
}

beforeEach(() => {
	window.localStorage.clear();
});

afterEach(() => {
	window.localStorage.clear();
});

describe("createEditorUiStore", () => {
	it("namespaces persistence by storeId", async () => {
		const a = createEditorUiStore({ storeId: "a" });
		const b = createEditorUiStore({ storeId: "b" });

		a.getState().setActiveTab("layer");
		b.getState().setActiveTab("insert");

		const aStored = window.localStorage.getItem("anvilkit-ui-a");
		const bStored = window.localStorage.getItem("anvilkit-ui-b");
		expect(aStored).toContain("layer");
		expect(bStored).toContain("insert");
		expect(aStored).not.toBe(bStored);
	});

	it("excludes drawerSearch from persistence", () => {
		const store = createEditorUiStore({ storeId: "search-test" });
		store.getState().setDrawerSearch("hero");
		const stored = window.localStorage.getItem("anvilkit-ui-search-test");
		expect(stored).not.toBeNull();
		expect(stored ?? "").not.toContain("hero");
	});

	it("rehydrates persisted slice across instances", async () => {
		const first = createEditorUiStore({ storeId: "rehydrate" });
		first.getState().setActiveTab("layer");
		first.getState().setCanvasZoom(1.25);
		first.getState().setDrawerSearch("transient");

		// Construct a fresh store with the same storeId — should pick up
		// the persisted slice, but not drawerSearch.
		const second = createEditorUiStore({ storeId: "rehydrate" });
		await (second as unknown as PersistableStoreApi).persist.rehydrate();
		const state = second.getState();
		expect(state.activeTab).toBe("layer");
		expect(state.canvasZoom).toBe(1.25);
		expect(state.drawerSearch).toBe("");
	});

	it("reset() returns every field to defaults", () => {
		const store = createEditorUiStore({ storeId: "reset" });
		const state = store.getState();
		state.setActiveTab("layer");
		state.setDrawerSearch("query");
		state.setCanvasZoom(2);
		state.setDrawerCollapsed(true);
		state.setOutlineExpanded("node-1", true);

		state.reset();
		const after = store.getState();
		expect(after.activeTab).toBe("insert");
		expect(after.drawerSearch).toBe("");
		expect(after.canvasZoom).toBe(1);
		expect(after.drawerCollapsed).toBe(false);
		expect(after.outlineExpanded).toEqual({});
	});

	it("caps the in-memory expansion map (most-recently-toggled kept)", () => {
		const store = createEditorUiStore({ storeId: "cap-in-memory" });
		const state = store.getState();
		// Toggle well past the 1000-key limit.
		for (let i = 0; i < 1100; i++) {
			state.setOutlineExpanded(`node-${i}`, true);
		}
		const map = store.getState().outlineExpanded;
		expect(Object.keys(map).length).toBe(1000);
		// Oldest 100 evicted, most-recent 1000 retained.
		expect(map["node-0"]).toBeUndefined();
		expect(map["node-99"]).toBeUndefined();
		expect(map["node-100"]).toBe(true);
		expect(map["node-1099"]).toBe(true);
	});
});
