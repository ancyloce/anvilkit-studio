/**
 * @file Tests for the sidebar registry store.
 *
 * Three contracts:
 *   1. Each `register*` action stores the entry, and the returned
 *      handle removes it cleanly (idempotent on double-call).
 *   2. Two stores from `createSidebarRegistryStore()` are isolated —
 *      registering in store A never affects store B.
 *   3. Subscribers are notified on every register / unregister so the
 *      sidebar re-renders without prop drilling.
 */

import { describe, expect, it, vi } from "vitest";
import { createSidebarRegistryStore } from "@/state/sidebar-registry-store";
import type {
  StudioAssetAction,
  StudioAssetSource,
  StudioCopilotPanel,
  StudioCopySnippetPack,
  StudioInsertSection,
  StudioLayerQuickAdd,
} from "@/types/sidebar";

const SECTION: StudioInsertSection = {
  id: "recommended",
  titleKey: "studio.module.insert.section.recommended",
  predicate: () => true,
};

const QUICK_ADD: StudioLayerQuickAdd = {
  id: "row",
  labelKey: "studio.module.layer.layers.add",
  insert: () => undefined,
};

const ASSET_ACTION: StudioAssetAction = {
  id: "open-cdn",
  labelKey: "open-cdn",
  run: () => undefined,
};

const COPY_PACK: StudioCopySnippetPack = {
  id: "english-base",
  snippets: [{ id: "s1", category: "basic", title: "Title", body: "Body" }],
};

const FAKE_ASSET_SOURCE: StudioAssetSource = {
  list: () => [],
  upload: async () => [],
};

const COPILOT_PANEL: StudioCopilotPanel = {
  render: () => null,
};

describe("sidebar-registry-store", () => {
  it("registerInsertSection stores and unregisters", () => {
    const store = createSidebarRegistryStore();
    const unregister = store.getState().registerInsertSection(SECTION);
    expect(store.getState().insertSections.get("recommended")).toBe(SECTION);

    unregister();
    expect(store.getState().insertSections.has("recommended")).toBe(false);

    // Idempotent on double-call.
    expect(() => unregister()).not.toThrow();
  });

  it("registerInsertSection unregister only removes its own registration", () => {
    const store = createSidebarRegistryStore();
    const replacement: StudioInsertSection = {
      ...SECTION,
      titleKey: "studio.module.insert.section.navigation",
    };
    const unregisterOriginal = store.getState().registerInsertSection(SECTION);
    store.getState().registerInsertSection(replacement);

    unregisterOriginal();

    expect(store.getState().insertSections.get("recommended")).toBe(
      replacement,
    );
  });

  it("registerLayerQuickAdd stores and unregisters", () => {
    const store = createSidebarRegistryStore();
    const off = store.getState().registerLayerQuickAdd(QUICK_ADD);
    expect(store.getState().layerQuickAdds.get("row")).toBe(QUICK_ADD);
    off();
    expect(store.getState().layerQuickAdds.has("row")).toBe(false);
  });

  it("registerLayerQuickAdd unregister only removes its own registration", () => {
    const store = createSidebarRegistryStore();
    const replacement: StudioLayerQuickAdd = {
      ...QUICK_ADD,
      labelKey: "studio.module.layer.layers.add.row",
    };
    const unregisterOriginal = store
      .getState()
      .registerLayerQuickAdd(QUICK_ADD);
    store.getState().registerLayerQuickAdd(replacement);

    unregisterOriginal();

    expect(store.getState().layerQuickAdds.get("row")).toBe(replacement);
  });

  it("registerAssetSource last-write-wins; matching unregister clears", () => {
    const store = createSidebarRegistryStore();
    const off1 = store.getState().registerAssetSource(FAKE_ASSET_SOURCE);
    expect(store.getState().assetSource).toBe(FAKE_ASSET_SOURCE);

    const second: StudioAssetSource = {
      list: () => [],
      upload: async () => [],
    };
    store.getState().registerAssetSource(second);
    expect(store.getState().assetSource).toBe(second);

    // First unregister is now a no-op because the source no longer
    // matches the one captured in its closure.
    off1();
    expect(store.getState().assetSource).toBe(second);
  });

  it("registerAssetAction stores and unregisters", () => {
    const store = createSidebarRegistryStore();
    const off = store.getState().registerAssetAction(ASSET_ACTION);
    expect(store.getState().assetActions.get("open-cdn")).toBe(ASSET_ACTION);
    off();
    expect(store.getState().assetActions.has("open-cdn")).toBe(false);
  });

  it("registerAssetAction unregister only removes its own registration", () => {
    const store = createSidebarRegistryStore();
    const replacement: StudioAssetAction = {
      ...ASSET_ACTION,
      run: () => undefined,
    };
    const unregisterOriginal = store
      .getState()
      .registerAssetAction(ASSET_ACTION);
    store.getState().registerAssetAction(replacement);

    unregisterOriginal();

    expect(store.getState().assetActions.get("open-cdn")).toBe(replacement);
  });

  it("registerCopySnippetPack stores and unregisters", () => {
    const store = createSidebarRegistryStore();
    const off = store.getState().registerCopySnippetPack(COPY_PACK);
    expect(store.getState().copyPacks.get("english-base")).toBe(COPY_PACK);
    off();
    expect(store.getState().copyPacks.has("english-base")).toBe(false);
  });

  it("registerCopySnippetPack unregister only removes its own registration", () => {
    const store = createSidebarRegistryStore();
    const replacement: StudioCopySnippetPack = {
      ...COPY_PACK,
      locale: "en-US",
    };
    const unregisterOriginal = store
      .getState()
      .registerCopySnippetPack(COPY_PACK);
    store.getState().registerCopySnippetPack(replacement);

    unregisterOriginal();

    expect(store.getState().copyPacks.get("english-base")).toBe(replacement);
  });

  it("registerCopilotPanel last-write-wins; matching unregister clears", () => {
    const store = createSidebarRegistryStore();
    const off1 = store.getState().registerCopilotPanel(COPILOT_PANEL);
    expect(store.getState().copilotPanel).toBe(COPILOT_PANEL);

    const second: StudioCopilotPanel = { render: () => null };
    store.getState().registerCopilotPanel(second);
    expect(store.getState().copilotPanel).toBe(second);

    // First unregister is now a no-op because the panel no longer
    // matches the one captured in its closure.
    off1();
    expect(store.getState().copilotPanel).toBe(second);
  });

  it("isolates per-instance registries", () => {
    const a = createSidebarRegistryStore();
    const b = createSidebarRegistryStore();
    a.getState().registerInsertSection(SECTION);
    expect(a.getState().insertSections.size).toBe(1);
    expect(b.getState().insertSections.size).toBe(0);
  });

  it("notifies subscribers on register and unregister", () => {
    const store = createSidebarRegistryStore();
    const listener = vi.fn();
    const unsub = store.subscribe(listener);

    const off = store.getState().registerInsertSection(SECTION);
    expect(listener).toHaveBeenCalledTimes(1);

    off();
    expect(listener).toHaveBeenCalledTimes(2);

    unsub();
  });
});
