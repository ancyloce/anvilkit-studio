/**
 * @file Runtime test: plugin contexts can register sidebar surfaces.
 *
 * This test wires a real `SidebarRegistryStore` into a synthetic
 * `StudioPluginContext` (matching the shape `<Studio>` builds at
 * mount time) and runs a plugin that calls every `register*` helper
 * during `register()`. Asserts:
 *
 * 1. Every helper deposits its entry into the registry store.
 * 2. The returned `unregister()` handle removes the entry.
 * 3. Hand-written contexts that omit the optional helpers compile
 *    (covered structurally by the type test suite — this file
 *    exercises the runtime side).
 */

import { describe, expect, it } from "vitest";

import { createStudioConfig } from "@/config/create-config";
import { compilePlugins } from "@/runtime/compile-plugins";
import { createSidebarRegistryStore } from "@/state/sidebar-registry-store";
import type { StudioPlugin, StudioPluginContext } from "@/types/plugin";

function buildCtx(
	registry: ReturnType<typeof createSidebarRegistryStore>,
): StudioPluginContext {
	return {
		getData: () => ({ content: [], root: { props: {} }, zones: {} }),
		getPuckApi: () => {
			throw new Error("test stub: getPuckApi unbound");
		},
		studioConfig: createStudioConfig(),
		log: () => undefined,
		emit: () => undefined,
		registerAssetResolver: () => undefined,
		registerInsertSection: (section) =>
			registry.getState().registerInsertSection(section),
		registerLayerQuickAdd: (item) =>
			registry.getState().registerLayerQuickAdd(item),
		registerAssetSource: (source) =>
			registry.getState().registerAssetSource(source),
		registerAssetAction: (action) =>
			registry.getState().registerAssetAction(action),
		registerCopySnippetPack: (pack) =>
			registry.getState().registerCopySnippetPack(pack),
		registerCopilotPanel: (panel) =>
			registry.getState().registerCopilotPanel(panel),
		registerHistoryPanel: (panel) =>
			registry.getState().registerHistoryPanel(panel),
	};
}

describe("plugin context — register* sidebar helpers", () => {
	it("deposits all registrations and unregister cleans up", async () => {
		const registry = createSidebarRegistryStore();
		const ctx = buildCtx(registry);

		const offHandles: Array<() => void> = [];
		const plugin: StudioPlugin = {
			meta: {
				id: "com.example.sidebar",
				name: "Sidebar test",
				version: "1.0.0",
				coreVersion: "^0.1.0",
			},
			register(innerCtx) {
				offHandles.push(
					innerCtx.registerInsertSection!({
						id: "section-1",
						titleKey: "studio.module.insert.section.recommended",
						predicate: () => true,
					}),
					innerCtx.registerLayerQuickAdd!({
						id: "quick-row",
						labelKey: "studio.module.layer.layers.add",
						insert: () => undefined,
					}),
					innerCtx.registerAssetSource!({
						list: () => [],
						upload: async () => [],
					}),
					innerCtx.registerAssetAction!({
						id: "action-1",
						labelKey: "action-1",
						run: () => undefined,
					}),
					innerCtx.registerCopySnippetPack!({
						id: "pack-1",
						snippets: [{ id: "s1", category: "basic", title: "T", body: "B" }],
					}),
					innerCtx.registerCopilotPanel!({
						render: () => null,
					}),
					innerCtx.registerHistoryPanel!({
						render: () => null,
					}),
				);
				return { meta: plugin.meta };
			},
		};

		await compilePlugins([plugin], ctx);

		const state = registry.getState();
		expect(state.insertSections.has("section-1")).toBe(true);
		expect(state.layerQuickAdds.has("quick-row")).toBe(true);
		expect(state.assetSource).not.toBeNull();
		expect(state.assetActions.has("action-1")).toBe(true);
		expect(state.copyPacks.has("pack-1")).toBe(true);
		expect(state.copilotPanel).not.toBeNull();
		expect(state.historyPanel).not.toBeNull();

		for (const off of offHandles) off();

		const cleared = registry.getState();
		expect(cleared.insertSections.size).toBe(0);
		expect(cleared.layerQuickAdds.size).toBe(0);
		expect(cleared.assetSource).toBeNull();
		expect(cleared.assetActions.size).toBe(0);
		expect(cleared.copyPacks.size).toBe(0);
		expect(cleared.copilotPanel).toBeNull();
		expect(cleared.historyPanel).toBeNull();
	});

	it("hand-written contexts may omit the register* helpers", () => {
		// Compile-time contract: omitting all five register* methods
		// must still satisfy `StudioPluginContext`. Runtime is incidental
		// — nothing executes here. The fact that this assigns at all is
		// the assertion.
		const minimal: StudioPluginContext = {
			getData: () => ({ content: [], root: { props: {} }, zones: {} }),
			getPuckApi: () => {
				throw new Error("test stub");
			},
			studioConfig: createStudioConfig(),
			log: () => undefined,
			emit: () => undefined,
			registerAssetResolver: () => undefined,
		};
		expect(minimal.registerInsertSection).toBeUndefined();
		expect(minimal.registerLayerQuickAdd).toBeUndefined();
		expect(minimal.registerAssetSource).toBeUndefined();
		expect(minimal.registerAssetAction).toBeUndefined();
		expect(minimal.registerCopySnippetPack).toBeUndefined();
		expect(minimal.registerCopilotPanel).toBeUndefined();
		expect(minimal.registerHistoryPanel).toBeUndefined();
	});
});
