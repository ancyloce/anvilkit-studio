/**
 * @file Phase 0 guardrail (provider-consolidation report §5, task T0.2).
 *
 * Pins the two store invariants the provider-consolidation refactor must
 * not break:
 *
 *   1. STORE IDENTITY STABILITY — the per-instance store handles the
 *      controller creates via `useState(() => createXStore())` keep
 *      referential identity across a re-render. Phase 1 (composite
 *      `<StudioProviderStack>`) and Phase 2 (unified slice store) both
 *      re-shape where/how these are created; if a refactor moves store
 *      creation into the render body or a `useMemo` with unstable deps,
 *      every keystroke would mint a fresh store and silently drop state.
 *      This test fails the moment that happens.
 *
 *   2. PER-`storeId` ISOLATION for the `ai` / `editor-ui` /
 *      `sidebar-registry` stores — exactly the stores Phase 2 merges into
 *      one slice store, and the three the existing H3 mount test
 *      (`Studio.multi-instance.test.tsx`) does NOT cover (it proves
 *      theme + export). Tested at the factory level: fast, deterministic,
 *      and free of the full-`<Studio>`/`<Puck>` jsdom-mount flakiness
 *      documented across the core test suite.
 *
 * Complements — deliberately does not duplicate — the theme/export
 * isolation and persistence-key namespacing already proven in
 * `Studio.multi-instance.test.tsx`.
 */

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useStudioController } from "@/components/use-studio-controller";
import { createEditorUiStore, createSidebarRegistryStore } from "@/state/index";
import { createAiStore } from "@/state/slices/ai-store";
import { useRehydratedStore } from "@/state/use-rehydrated-store";
import type { StudioInsertSection } from "@/types/sidebar";

// A minimal, structurally-valid Puck config. Kept at module scope so its
// identity is stable across the controller's re-renders (it is not part of
// the compile key, but a stable reference keeps the test honest about what
// changed between renders).
const PUCK_CONFIG = { components: {} };

beforeEach(() => {
	localStorage.clear();
});

afterEach(cleanup);

describe("useStudioController — store identity stability across re-render (Phase 0 guardrail)", () => {
	it("keeps theme/export/ai/sidebar-registry store handles referentially stable on re-render", async () => {
		const { result, rerender, unmount } = renderHook(() =>
			useStudioController({ puckConfig: PUCK_CONFIG, chrome: "puck" }),
		);

		const first = {
			theme: result.current.themeStore,
			exportStore: result.current.exportStore,
			ai: result.current.aiStore,
			sidebar: result.current.sidebarRegistryStore,
			storeId: result.current.resolvedStoreId,
		};

		// Force another render pass. The store handles are created in
		// `useState` initializers and must survive re-render unchanged.
		rerender();

		expect(result.current.themeStore).toBe(first.theme);
		expect(result.current.exportStore).toBe(first.exportStore);
		expect(result.current.aiStore).toBe(first.ai);
		expect(result.current.sidebarRegistryStore).toBe(first.sidebar);
		expect(result.current.resolvedStoreId).toBe(first.storeId);

		// Let the async plugin compile settle inside act() before unmount so
		// no state update lands after teardown.
		await waitFor(() => {
			expect(result.current.compiled).not.toBeNull();
		});
		unmount();
	});

	it("keeps the editor-ui store handle stable across re-render (created via useRehydratedStore)", async () => {
		// The editor-ui store is NOT controller-owned — `EditorUiStoreProvider`
		// creates and holds it through `useRehydratedStore` (the same hook used
		// for theme/export/ai when not injected). Phase 2 merges editor-ui into
		// the unified slice store, so its handle must stay referentially stable
		// across a render pass exactly like the controller-owned stores above.
		const { result, rerender, unmount } = renderHook(() =>
			useRehydratedStore("guardrail-ui", createEditorUiStore),
		);

		const first = result.current.store;
		rerender();
		expect(result.current.store).toBe(first);

		// Let the deferred rehydrate settle inside act() before teardown.
		await waitFor(() => {
			expect(result.current.hydrated).toBe(true);
		});
		unmount();
	});
});

describe("store factories — per-storeId isolation for ai / editor-ui / sidebar-registry (Phase 2 merge guard)", () => {
	it("keeps AI store state independent across storeIds", () => {
		const a = createAiStore({ storeId: "A" });
		const b = createAiStore({ storeId: "B" });
		expect(a).not.toBe(b);

		a.getState().startGeneration("hello");

		expect(a.getState().isGenerating).toBe(true);
		expect(a.getState().lastPrompt).toBe("hello");
		// Instance B is untouched.
		expect(b.getState().isGenerating).toBe(false);
		expect(b.getState().lastPrompt).toBeNull();
		expect(b.getState().history).toHaveLength(0);

		// Persisted under a per-storeId key, never the bare key.
		expect(localStorage.getItem("anvilkit-core-ai-A")).not.toBeNull();
		expect(localStorage.getItem("anvilkit-core-ai")).toBeNull();
	});

	it("keeps editor-UI store state independent across storeIds", () => {
		const a = createEditorUiStore({ storeId: "A" });
		const b = createEditorUiStore({ storeId: "B" });
		expect(a).not.toBe(b);

		a.getState().setActiveTab("layer");

		expect(a.getState().activeTab).toBe("layer");
		// Instance B keeps the documented default tab.
		expect(b.getState().activeTab).toBe("insert");

		expect(localStorage.getItem("anvilkit-ui-A")).not.toBeNull();
		expect(localStorage.getItem("anvilkit-ui")).toBeNull();
	});

	it("keeps sidebar-registry store state independent across instances", () => {
		const a = createSidebarRegistryStore();
		const b = createSidebarRegistryStore();
		expect(a).not.toBe(b);

		const section: StudioInsertSection = {
			id: "guardrail-section",
			titleKey: "studio.module.insert.section.recommended",
			predicate: () => true,
		};
		a.getState().registerInsertSection(section);

		expect(a.getState().insertSections.size).toBe(1);
		// Instance B is untouched (a fresh factory store starts empty).
		expect(b.getState().insertSections.size).toBe(0);
	});
});
