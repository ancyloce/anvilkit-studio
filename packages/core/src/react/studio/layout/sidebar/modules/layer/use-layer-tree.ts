/**
 * @file `useLayerTree()` — reactive Puck view-model for the draggable
 * Layer tree, plus the pure `resolveDrop()` resolver.
 *
 * `<Puck.Outline />` is a black box, so the Layers panel renders its own
 * tree. This module projects a narrow, reactive slice of Puck state into
 * a recursive `LayerNode` model and exposes a side-effect-free helper
 * that turns a (source, destination) pair into the exact Puck action —
 * `reorder` for same-zone moves, `move` across zones — or `null` when
 * the drop would create a cycle (a component dropped into its own
 * descendant zone).
 *
 * Puck zone keys are compound `"<parentComponentId>:<slotName>"`. The
 * root list lives in `data.content` and is addressed by the compound
 * key `"root:default-zone"` (bare `default-zone` silently no-ops — see
 * `LayersPanel.tsx`). Component identity is `item.props.id`.
 */

import type { ComponentData, Data, PuckAction } from "@puckeditor/core";
import { useMemo } from "react";
import { useReactivePuck } from "@/overrides/utils/use-reactive-puck";

/** Compound dispatch/selection key for the root content list. */
export const ROOT_ZONE = "root:default-zone";

export interface LayerChildZone {
  /** Puck `data.zones` key — also the dispatch `destinationZone`. */
  readonly zoneKey: string;
  /** Slot name (the part after `"<id>:"`). */
  readonly slotName: string;
  readonly items: readonly LayerNode[];
}

export interface LayerNode {
  readonly id: string;
  readonly type: string;
  readonly label: string;
  /** Dispatch zone key this node currently lives in. */
  readonly zone: string;
  /** Index within `zone`. */
  readonly index: number;
  /** Indentation depth (root = 0). */
  readonly depth: number;
  readonly childZones: readonly LayerChildZone[];
}

export interface LayerTreeModel {
  readonly roots: readonly LayerNode[];
  readonly selectedId: string | null;
}

export interface DropEndpoint {
  readonly zone: string;
  readonly index: number;
}

type ComponentList = readonly ComponentData[];

function componentId(item: ComponentData): string | null {
  const id = (item.props as { id?: unknown } | undefined)?.id;
  return typeof id === "string" ? id : null;
}

function buildNodes(
  items: ComponentList,
  zone: string,
  depth: number,
  zones: Readonly<Record<string, ComponentList>>,
  labelFor: (type: string) => string,
): LayerNode[] {
  const out: LayerNode[] = [];
  items.forEach((item, index) => {
    const id = componentId(item);
    if (id === null) return;
    const prefix = `${id}:`;
    const childZones: LayerChildZone[] = Object.keys(zones)
      .filter((key) => key.startsWith(prefix))
      .map((zoneKey) => ({
        zoneKey,
        slotName: zoneKey.slice(prefix.length),
        items: buildNodes(
          zones[zoneKey] ?? [],
          zoneKey,
          depth + 1,
          zones,
          labelFor,
        ),
      }));
    out.push({
      id,
      type: item.type,
      label: labelFor(item.type),
      zone,
      index,
      depth,
      childZones,
    });
  });
  return out;
}

/**
 * Subscribe to a narrow, reactive slice of Puck state and project it
 * into the recursive layer tree. Each `useReactivePuck` call selects a
 * primitive or a stable reference so re-renders track only real
 * structural/selection changes.
 */
export function useLayerTree(): LayerTreeModel {
  const data = useReactivePuck((s) => s.appState.data as Data);
  const selectedId = useReactivePuck(
    (s) => (s.selectedItem?.props as { id?: unknown } | undefined)?.id ?? null,
  );
  const components = useReactivePuck((s) => s.config.components);

  return useMemo<LayerTreeModel>(() => {
    const zones = (data.zones ?? {}) as Readonly<Record<string, ComponentList>>;
    const labelFor = (type: string): string => {
      const entry = components?.[type] as { label?: string } | undefined;
      return entry?.label ?? type;
    };
    const roots = buildNodes(data.content ?? [], ROOT_ZONE, 0, zones, labelFor);
    return {
      roots,
      selectedId: typeof selectedId === "string" ? selectedId : null,
    };
  }, [data, selectedId, components]);
}

/** Depth-first list of `{id, zone, index}` for every node in the tree. */
export function flattenNodes(roots: readonly LayerNode[]): LayerNode[] {
  const out: LayerNode[] = [];
  const walk = (nodes: readonly LayerNode[]): void => {
    for (const node of nodes) {
      out.push(node);
      for (const zone of node.childZones) walk(zone.items);
    }
  };
  walk(roots);
  return out;
}

/** Find a node by component id anywhere in the tree. */
export function findNode(
  roots: readonly LayerNode[],
  id: string,
): LayerNode | null {
  return flattenNodes(roots).find((node) => node.id === id) ?? null;
}

/**
 * Every zone key owned by `node` or any of its descendants. Used as the
 * cycle guard: a node may never be dropped into one of these zones.
 */
export function collectSubtreeZones(node: LayerNode): Set<string> {
  const zones = new Set<string>();
  const walk = (current: LayerNode): void => {
    for (const childZone of current.childZones) {
      zones.add(childZone.zoneKey);
      for (const item of childZone.items) walk(item);
    }
  };
  walk(node);
  return zones;
}

/**
 * Pure resolver: map a (source, destination) pair to the Puck action
 * that performs the drop, or `null` to abort.
 *
 * - destination inside the dragged node's own subtree → `null` (cycle)
 * - no-op (same zone + same index) → `null`
 * - same zone → `reorder`
 * - different zone → `move`
 */
export function resolveDrop(args: {
  readonly source: DropEndpoint;
  readonly dest: DropEndpoint;
  readonly draggedSubtreeZones: ReadonlySet<string>;
}): PuckAction | null {
  const { source, dest, draggedSubtreeZones } = args;
  if (draggedSubtreeZones.has(dest.zone)) return null;
  if (source.zone === dest.zone) {
    if (source.index === dest.index) return null;
    return {
      type: "reorder",
      sourceIndex: source.index,
      destinationIndex: dest.index,
      destinationZone: dest.zone,
    };
  }
  return {
    type: "move",
    sourceIndex: source.index,
    sourceZone: source.zone,
    destinationIndex: dest.index,
    destinationZone: dest.zone,
  };
}
