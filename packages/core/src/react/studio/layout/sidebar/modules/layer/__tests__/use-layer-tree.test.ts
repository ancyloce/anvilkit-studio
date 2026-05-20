/**
 * @file Tests for the Layer-tree view-model and the pure `resolveDrop`
 * resolver.
 *
 * `resolveDrop` is side-effect-free, so most behaviour (reorder vs.
 * move vs. cycle-guard) is asserted directly. `useLayerTree` is
 * exercised through `renderHook` with a stubbed `@puckeditor/core` so
 * the recursive builder (zone-prefix matching, nesting, labels) is
 * covered without a real Puck store.
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const snapshot: {
  appState: {
    data: {
      content: { type: string; props: { id: string } }[];
      zones: Record<string, { type: string; props: { id: string } }[]>;
    };
  };
  selectedItem: { props: { id: string } } | null;
  config: { components: Record<string, { label?: string }> };
} = {
  appState: { data: { content: [], zones: {} } },
  selectedItem: null,
  config: { components: {} },
};

vi.mock("@puckeditor/core", () => ({
  createUsePuck:
    () =>
    <T>(selector: (s: typeof snapshot) => T): T =>
      selector(snapshot),
  useGetPuck: () => () => snapshot,
}));

import {
  collectSubtreeZones,
  findNode,
  resolveDrop,
  ROOT_ZONE,
  useLayerTree,
} from "../use-layer-tree";

describe("resolveDrop", () => {
  const noZones = new Set<string>();

  it("emits a reorder action for a same-zone move", () => {
    expect(
      resolveDrop({
        source: { zone: ROOT_ZONE, index: 0 },
        dest: { zone: ROOT_ZONE, index: 2 },
        draggedSubtreeZones: noZones,
      }),
    ).toEqual({
      type: "reorder",
      sourceIndex: 0,
      destinationIndex: 2,
      destinationZone: ROOT_ZONE,
    });
  });

  it("emits a move action across zones", () => {
    expect(
      resolveDrop({
        source: { zone: ROOT_ZONE, index: 1 },
        dest: { zone: "abc:content", index: 0 },
        draggedSubtreeZones: noZones,
      }),
    ).toEqual({
      type: "move",
      sourceIndex: 1,
      sourceZone: ROOT_ZONE,
      destinationIndex: 0,
      destinationZone: "abc:content",
    });
  });

  it("returns null when the destination is inside the dragged subtree (cycle)", () => {
    expect(
      resolveDrop({
        source: { zone: ROOT_ZONE, index: 0 },
        dest: { zone: "self:content", index: 0 },
        draggedSubtreeZones: new Set(["self:content"]),
      }),
    ).toBeNull();
  });

  it("returns null for a no-op (same zone and index)", () => {
    expect(
      resolveDrop({
        source: { zone: ROOT_ZONE, index: 3 },
        dest: { zone: ROOT_ZONE, index: 3 },
        draggedSubtreeZones: noZones,
      }),
    ).toBeNull();
  });
});

describe("useLayerTree", () => {
  it("builds a nested tree with labels and collects subtree zones", () => {
    snapshot.appState.data = {
      content: [
        { type: "Layout", props: { id: "layout-1" } },
        { type: "Text", props: { id: "text-1" } },
      ],
      zones: {
        "layout-1:default": [{ type: "Text", props: { id: "text-2" } }],
      },
    };
    snapshot.selectedItem = { props: { id: "text-1" } };
    snapshot.config.components = { Layout: { label: "Section" }, Text: {} };

    const { result } = renderHook(() => useLayerTree());
    const { roots, selectedId } = result.current;

    expect(selectedId).toBe("text-1");
    expect(roots).toHaveLength(2);

    const layout = roots[0];
    expect(layout?.label).toBe("Section"); // config label wins
    expect(layout?.zone).toBe(ROOT_ZONE);
    expect(layout?.index).toBe(0);
    expect(layout?.childZones).toHaveLength(1);
    expect(layout?.childZones[0]?.zoneKey).toBe("layout-1:default");
    expect(layout?.childZones[0]?.slotName).toBe("default");
    expect(layout?.childZones[0]?.items[0]?.id).toBe("text-2");
    expect(layout?.childZones[0]?.items[0]?.depth).toBe(1);

    expect(roots[1]?.label).toBe("Text"); // falls back to type

    const found = findNode(roots, "text-2");
    expect(found?.id).toBe("text-2");
    expect(collectSubtreeZones(layout as NonNullable<typeof layout>)).toEqual(
      new Set(["layout-1:default"]),
    );
  });
});
