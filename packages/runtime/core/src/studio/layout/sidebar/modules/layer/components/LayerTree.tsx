/**
 * @file `LayerTree` — the draggable Layer tree that replaces
 * `<Puck.Outline />` in the Layers panel.
 *
 * One `<DndContext>` wraps the whole tree. Every zone (the root content
 * list and each component child zone) is its own `<SortableContext>` and
 * a droppable container, so items reorder within a zone and can be
 * dragged into other zones. On drop the (source, destination) pair is
 * fed to the pure {@link resolveDrop}, which yields the exact Puck
 * action — `reorder` (same zone) or `move` (cross zone) — or `null`
 * when the drop would create a cycle. Source coordinates are
 * re-resolved from `getSelectorForId` at drop time because the tree may
 * have shifted mid-drag (proven concern in `useInsertSnippet`).
 */

import {
	type CollisionDetection,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	pointerWithin,
	rectIntersection,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useGetPuck } from "@puckeditor/core";
import { memo, type ReactNode, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Windowed } from "@/primitives/windowed";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import { useEditorUiStore } from "@/state/slices/editor-ui-selectors";
import type { EditorUiState } from "@/state/slices/editor-ui-store";
import {
	buildNodeIndex,
	collectSubtreeZones,
	flattenVisibleRows,
	isCycleDrop,
	type LayerFlatRow,
	type LayerNode,
	ROOT_ZONE,
	resolveDrop,
	useLayerTree,
} from "../hooks/use-layer-tree";
import { useSyncSelectedLayerIntoView } from "../hooks/use-sync-selected-layer-into-view";
import { LayerRow } from "./LayerRow";

/** Droppable id namespace so zone keys never collide with component ids. */
const ZONE_PREFIX = "zone:";

/**
 * At/above this many *visible* rows the tree swaps from the recursive
 * `LayerZone` renderer to a flat, windowed list (bounded DOM nodes). Below
 * it the nested renderer is kept byte-identical, preserving the existing
 * per-zone drag/drop behavior and all its tests.
 */
const WINDOW_THRESHOLD = 50;
/** Approx. `LayerRow` height (h-7 = 28px) for the virtualizer estimate. */
const ROW_ESTIMATE_PX = 28;
/** Internal scroll viewport height when the flat path is active. */
const TREE_VIEWPORT_PX = 480;

/** Pointer-first, rect-fallback collision — the dnd-kit multi-container recipe. */
const collisionDetection: CollisionDetection = (args) => {
	const pointerCollisions = pointerWithin(args);
	return pointerCollisions.length > 0
		? pointerCollisions
		: rectIntersection(args);
};

// Module-scope selectors so their identity is stable across renders
// (an inline `(s) => …` allocates a new function each render, which
// defeats memoization further down the tree).
const selectOutlineExpanded = (
	s: EditorUiState,
): Readonly<Record<string, boolean>> => s.outlineExpanded;
const selectSetOutlineExpanded = (
	s: EditorUiState,
): ((id: string, expanded: boolean) => void) => s.setOutlineExpanded;

interface LayerZoneProps {
	readonly zoneKey: string;
	readonly nodes: readonly LayerNode[];
	readonly selectedId: string | null;
}

function LayerZoneImpl({
	zoneKey,
	nodes,
	selectedId,
}: LayerZoneProps): ReactNode {
	const outlineExpanded = useEditorUiStore(selectOutlineExpanded);
	const setOutlineExpanded = useEditorUiStore(selectSetOutlineExpanded);
	// One stable handler for every row in this zone: keeps the
	// `LayerRow` `React.memo` boundary intact on selection changes.
	const handleToggle = useCallback(
		(id: string, next: boolean): void => setOutlineExpanded(id, next),
		[setOutlineExpanded],
	);

	const { setNodeRef, isOver } = useDroppable({
		id: `${ZONE_PREFIX}${zoneKey}`,
		data: { kind: "zone", zone: zoneKey, count: nodes.length },
	});

	const ids = useMemo(() => nodes.map((node) => node.id), [nodes]);

	return (
		<SortableContext items={ids} strategy={verticalListSortingStrategy}>
			<div
				ref={setNodeRef}
				className={cn(
					"flex flex-col gap-px rounded",
					nodes.length === 0 && "min-h-6",
					isOver && "bg-[var(--editor-drop-target)]",
				)}
			>
				{nodes.map((node) => {
					// Outline expansion defaults to expanded when untouched.
					const expanded = outlineExpanded[node.id] !== false;
					const hasChildren = node.childZones.length > 0;
					return (
						<div key={node.id}>
							<LayerRow
								node={node}
								selected={selectedId === node.id}
								expanded={expanded}
								hasChildren={hasChildren}
								siblingCount={nodes.length}
								onToggleExpand={handleToggle}
							/>
							{hasChildren && expanded
								? node.childZones.map((childZone) => (
										<LayerZone
											key={childZone.zoneKey}
											zoneKey={childZone.zoneKey}
											nodes={childZone.items}
											selectedId={selectedId}
										/>
									))
								: null}
						</div>
					);
				})}
			</div>
		</SortableContext>
	);
}

/**
 * Memoized so an unrelated `LayerTree` re-render (e.g. drag-overlay
 * `activeId` state) does not re-render every zone — and a selection
 * change only re-renders zones whose `selectedId`/`nodes` changed,
 * not the whole tree (review §2.3). The recursive child below refers
 * to this memoized binding.
 */
const LayerZone = memo(LayerZoneImpl);

/**
 * Droppable target for an empty, expanded child zone in the flat windowed
 * path. Carries the same `{ kind: "zone", zone, count: 0 }` drag data the
 * nested `LayerZone` container exposes, so `handleDragEnd`/`resolveDrop`
 * treat a drop here identically (append into the empty zone).
 */
function LayerZoneDropTarget({
	zoneKey,
	depth,
}: {
	readonly zoneKey: string;
	readonly depth: number;
}): ReactNode {
	const { setNodeRef, isOver } = useDroppable({
		id: `${ZONE_PREFIX}${zoneKey}`,
		data: { kind: "zone", zone: zoneKey, count: 0 },
	});
	return (
		<div
			ref={setNodeRef}
			data-testid={`ak-layer-zone-drop-${zoneKey}`}
			style={{ paddingLeft: `${depth * 14 + 4}px` }}
			className={cn(
				"min-h-6 rounded",
				isOver && "bg-[var(--editor-drop-target)]",
			)}
		/>
	);
}

export function LayerTree(): ReactNode {
	const msg = useMsg();
	const getPuck = useGetPuck();
	const { roots, selectedId } = useLayerTree();
	const [activeId, setActiveId] = useState<string | null>(null);

	// `id → node` index for O(1) lookups in the drag handlers and a11y
	// announcements (review finding P-2) — replaces repeated
	// `findNode(roots, id)` full-tree walks. Rebuilt only when `roots`
	// changes (a data/component edit), not per render or selection.
	const nodeById = useMemo(() => buildNodeIndex(roots), [roots]);

	// Read expansion state here (not just per-row) so the flat path can
	// flatten exactly the visible rows the nested path would render.
	const outlineExpanded = useEditorUiStore(selectOutlineExpanded);
	const setOutlineExpanded = useEditorUiStore(selectSetOutlineExpanded);
	const handleToggle = useCallback(
		(id: string, next: boolean): void => setOutlineExpanded(id, next),
		[setOutlineExpanded],
	);

	// Canvas→sidebar selection sync (task Phase 6): expand ancestors of
	// the selected node and scroll its row into view, regardless of
	// whether the selection came from a canvas click or a layer-row
	// click — `selectedId` already reflects both.
	useSyncSelectedLayerIntoView(
		roots,
		selectedId,
		outlineExpanded,
		setOutlineExpanded,
	);

	const flatRows = useMemo(
		() => flattenVisibleRows(roots, outlineExpanded),
		[roots, outlineExpanded],
	);
	const useFlat = flatRows.length >= WINDOW_THRESHOLD;
	const flatNodeIds = useMemo(
		() => flatRows.flatMap((row) => (row.type === "node" ? [row.node.id] : [])),
		[flatRows],
	);
	const flatRowKey = useCallback((row: LayerFlatRow): string => row.key, []);
	const renderFlatRow = useCallback(
		(row: LayerFlatRow): ReactNode => {
			if (row.type === "zone-drop") {
				return <LayerZoneDropTarget zoneKey={row.zoneKey} depth={row.depth} />;
			}
			return (
				<LayerRow
					node={row.node}
					selected={selectedId === row.node.id}
					expanded={outlineExpanded[row.node.id] !== false}
					hasChildren={row.hasChildren}
					siblingCount={row.siblingCount}
					onToggleExpand={handleToggle}
				/>
			);
		},
		[selectedId, outlineExpanded, handleToggle],
	);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDragStart = useCallback((event: DragStartEvent): void => {
		setActiveId(String(event.active.id));
	}, []);

	const handleDragEnd = useCallback(
		(event: DragEndEvent): void => {
			setActiveId(null);
			const { active, over } = event;
			if (over === null) return;

			const draggedId = String(active.id);
			const snapshot = getPuck();
			const selector = snapshot.getSelectorForId(draggedId);
			if (selector === undefined) return;

			const overData = over.data.current as
				| {
						kind?: "item" | "zone";
						zone?: string;
						index?: number;
						count?: number;
				  }
				| undefined;
			if (overData?.zone === undefined) return;

			const destIndex =
				overData.kind === "zone"
					? (overData.count ?? 0)
					: (overData.index ?? 0);

			const draggedNode = nodeById.get(draggedId) ?? null;
			const draggedSubtreeZones =
				draggedNode === null
					? new Set<string>()
					: collectSubtreeZones(draggedNode);

			const action = resolveDrop({
				source: { zone: selector.zone, index: selector.index },
				dest: { zone: overData.zone, index: destIndex },
				draggedSubtreeZones,
			});
			if (action !== null) {
				snapshot.dispatch(action);
			} else if (isCycleDrop(overData.zone, draggedSubtreeZones)) {
				// The cycle rejection used to be silent (the drop just no-op'd).
				// Surface it — sonner toasts are announced via aria-live, so this
				// reaches screen-reader users as well as sighted ones.
				toast(msg("studio.module.layer.layers.tree.cycleRejected"));
			}
		},
		[getPuck, nodeById, msg],
	);

	const handleDragCancel = useCallback((): void => {
		setActiveId(null);
	}, []);

	const activeNode =
		activeId === null ? null : (nodeById.get(activeId) ?? null);

	if (roots.length === 0) {
		return (
			<p
				className="px-2 py-3 text-xs text-[var(--ak-studio-muted-fg)]"
				data-testid="ak-layer-tree-empty"
			>
				{msg("studio.module.layer.layers.tree.empty")}
			</p>
		);
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={collisionDetection}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
			accessibility={{
				screenReaderInstructions: {
					draggable: msg("studio.module.layer.layers.tree.instructions"),
				},
				announcements: {
					onDragStart: ({ active }) =>
						`${msg("studio.module.layer.layers.tree.announce.start")} ${
							nodeById.get(String(active.id))?.label ?? String(active.id)
						}`,
					onDragOver: () => "",
					onDragEnd: ({ active, over }) => {
						const id = String(active.id);
						const label = nodeById.get(id)?.label ?? id;
						const overZone = (
							over?.data.current as { zone?: string } | undefined
						)?.zone;
						const draggedNode = nodeById.get(id) ?? null;
						if (
							overZone !== undefined &&
							draggedNode !== null &&
							isCycleDrop(overZone, collectSubtreeZones(draggedNode))
						) {
							// Don't falsely announce "Dropped layer" for a rejected cycle.
							return msg("studio.module.layer.layers.tree.cycleRejected");
						}
						return `${msg(
							"studio.module.layer.layers.tree.announce.moved",
						)} ${label}`;
					},
					onDragCancel: () =>
						msg("studio.module.layer.layers.tree.announce.cancelled"),
				},
			}}
		>
			<div data-testid="ak-layer-tree">
				{useFlat ? (
					// Flat windowed path (large documents): one SortableContext
					// over every visible node id; each `LayerRow` still carries
					// its own `{ kind, zone, index }` drag data and self-indents
					// via `node.depth`, so `handleDragEnd`/`resolveDrop` are
					// unchanged. Empty expanded zones get a droppable placeholder.
					<SortableContext
						items={flatNodeIds}
						strategy={verticalListSortingStrategy}
					>
						<Windowed
							items={flatRows}
							itemKey={flatRowKey}
							renderItem={renderFlatRow}
							estimateSize={ROW_ESTIMATE_PX}
							maxHeight={TREE_VIEWPORT_PX}
							threshold={WINDOW_THRESHOLD}
							data-testid="ak-layer-tree-virtualized"
						/>
					</SortableContext>
				) : (
					<LayerZone
						zoneKey={ROOT_ZONE}
						nodes={roots}
						selectedId={selectedId}
					/>
				)}
			</div>
			<DragOverlay>
				{activeNode !== null ? (
					<div className="flex h-8 items-center gap-1 rounded-md bg-[var(--editor-panel-raised)] px-2 text-xs text-[var(--ak-studio-fg)] shadow-[var(--shadow-floating)] ring-1 ring-[var(--ak-studio-border)]">
						{activeNode.label}
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}
