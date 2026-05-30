/**
 * @file Tests for the v1 → v2 persisted-state migration.
 *
 * Two contracts (PRD §9.1 + §9.3):
 *
 * 1. Legacy `activeTab === "outline"` rewrites to `"layer"` on
 *    rehydrate so host apps with stored UI state land on the
 *    equivalent module after the bump.
 * 2. v1 payloads missing the new sidebar slices (`componentViewMode`,
 *    `assetCategoryFilter`, etc.) hydrate with the documented
 *    defaults rather than crashing or producing `undefined` slice
 *    values.
 * 3. New slice setters round-trip to `localStorage` and back.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	createEditorUiStore,
	EDITOR_UI_STORE_PERSIST_VERSION,
} from "@/state/editor-ui-store";

interface PersistableStoreApi {
	readonly persist: {
		rehydrate(): Promise<void>;
	};
}

const STORE_ID_PREFIX = "anvilkit-ui-";

function seedLegacyV1(
	storeId: string,
	persisted: Record<string, unknown>,
): void {
	window.localStorage.setItem(
		`${STORE_ID_PREFIX}${storeId}`,
		JSON.stringify({ state: persisted, version: 1 }),
	);
}

beforeEach(() => {
	window.localStorage.clear();
});

afterEach(() => {
	window.localStorage.clear();
});

describe("editor-ui-store migration", () => {
	it("rewrites legacy activeTab=outline → layer", async () => {
		seedLegacyV1("legacy-outline", {
			activeTab: "outline",
			drawerCollapsed: false,
			outlineExpanded: { "node-1": true },
			canvasViewport: "desktop",
			canvasZoom: 1,
		});

		const store = createEditorUiStore({ storeId: "legacy-outline" });
		await (store as unknown as PersistableStoreApi).persist.rehydrate();
		expect(store.getState().activeTab).toBe("layer");
		// Untouched fields survive.
		expect(store.getState().outlineExpanded).toEqual({ "node-1": true });
	});

	it("falls back to defaults when v1 state lacks new slices", async () => {
		seedLegacyV1("legacy-defaults", {
			activeTab: "insert",
			drawerCollapsed: true,
			outlineExpanded: {},
			canvasViewport: "desktop",
			canvasZoom: 1,
		});

		const store = createEditorUiStore({ storeId: "legacy-defaults" });
		await (store as unknown as PersistableStoreApi).persist.rehydrate();
		const state = store.getState();
		expect(state.componentViewMode).toBe("grid");
		expect(state.insertSectionsExpanded).toEqual({});
		expect(state.assetCategoryFilter).toBe("all");
		expect(state.copyCategoryFilter).toBe("all");
		expect(state.pagesExpanded).toEqual({});
		expect(state.layerSplitRatio).toBe(0.4);
		// Verified-good legacy fields still apply.
		expect(state.drawerCollapsed).toBe(true);
	});

	it("ignores unknown activeTab strings and uses the default", async () => {
		seedLegacyV1("legacy-unknown", { activeTab: "garbage" });
		const store = createEditorUiStore({ storeId: "legacy-unknown" });
		await (store as unknown as PersistableStoreApi).persist.rehydrate();
		expect(store.getState().activeTab).toBe("insert");
	});
});

describe("editor-ui-store sanitizes a corrupt blob at the CURRENT version", () => {
	// Regression: zustand calls `migrate` only on a version MISMATCH, so a
	// corrupt blob written at the live version (external corruption, hand-
	// editing, or a future partialize-shape change that forgets to bump the
	// version) bypassed the clamp and merged verbatim over the live
	// defaults. The store now also sanitizes through `merge`, which runs on
	// every hydrate. These seed at the CURRENT version so the `migrate` path
	// is NOT exercised — pre-fix they failed (value survived verbatim).
	function seedCurrent(
		storeId: string,
		persisted: Record<string, unknown>,
	): void {
		window.localStorage.setItem(
			`${STORE_ID_PREFIX}${storeId}`,
			JSON.stringify({
				state: persisted,
				version: EDITOR_UI_STORE_PERSIST_VERSION,
			}),
		);
	}

	it("clamps an unknown activeTab to the default", async () => {
		seedCurrent("corrupt-tab", { activeTab: "garbage" });
		const store = createEditorUiStore({ storeId: "corrupt-tab" });
		await (store as unknown as PersistableStoreApi).persist.rehydrate();
		expect(store.getState().activeTab).toBe("insert");
	});

	it("clamps an out-of-range layerSplitRatio to [0.15, 0.85]", async () => {
		seedCurrent("corrupt-split", { activeTab: "insert", layerSplitRatio: 5 });
		const store = createEditorUiStore({ storeId: "corrupt-split" });
		await (store as unknown as PersistableStoreApi).persist.rehydrate();
		expect(store.getState().layerSplitRatio).toBe(0.85);
	});

	it("falls back to defaults for non-conforming field types", async () => {
		seedCurrent("corrupt-shape", {
			activeTab: 123,
			componentViewMode: "spinny",
			assetCategoryFilter: true,
			outlineExpanded: "not-a-map",
		});
		const store = createEditorUiStore({ storeId: "corrupt-shape" });
		await (store as unknown as PersistableStoreApi).persist.rehydrate();
		const s = store.getState();
		expect(s.activeTab).toBe("insert");
		expect(s.componentViewMode).toBe("grid");
		expect(s.assetCategoryFilter).toBe("all");
		expect(s.outlineExpanded).toEqual({});
	});
});

describe("editor-ui-store new slices", () => {
	it("setComponentViewMode persists across instances", async () => {
		const a = createEditorUiStore({ storeId: "view-mode" });
		a.getState().setComponentViewMode("list");

		const b = createEditorUiStore({ storeId: "view-mode" });
		await (b as unknown as PersistableStoreApi).persist.rehydrate();
		expect(b.getState().componentViewMode).toBe("list");
	});

	it("setInsertSectionExpanded merges into the map", () => {
		const store = createEditorUiStore({ storeId: "sections" });
		store.getState().setInsertSectionExpanded("recommended", true);
		store.getState().setInsertSectionExpanded("team", false);
		expect(store.getState().insertSectionsExpanded).toEqual({
			recommended: true,
			team: false,
		});
	});

	it("setAssetCategoryFilter and setCopyCategoryFilter update slices", () => {
		const store = createEditorUiStore({ storeId: "filters" });
		store.getState().setAssetCategoryFilter("videos");
		store.getState().setCopyCategoryFilter("brand");
		expect(store.getState().assetCategoryFilter).toBe("videos");
		expect(store.getState().copyCategoryFilter).toBe("brand");
	});

	it("setLayerSplitRatio clamps to [0.15, 0.85]", () => {
		const store = createEditorUiStore({ storeId: "splitter" });
		store.getState().setLayerSplitRatio(0.05);
		expect(store.getState().layerSplitRatio).toBe(0.15);
		store.getState().setLayerSplitRatio(0.95);
		expect(store.getState().layerSplitRatio).toBe(0.85);
		store.getState().setLayerSplitRatio(0.6);
		expect(store.getState().layerSplitRatio).toBe(0.6);
	});

	it("setPageExpanded merges into the pages map", () => {
		const store = createEditorUiStore({ storeId: "pages" });
		store.getState().setPageExpanded("group-a", true);
		expect(store.getState().pagesExpanded).toEqual({ "group-a": true });
	});
});
