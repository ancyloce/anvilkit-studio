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
import { cn } from "@/overrides/utils/cn";
import { useMsg } from "@/state/editor-i18n-store";
import type { EditorUiState } from "@/state/editor-ui-store";
import { useEditorUiStore } from "@/state/hooks";
import { LayerRow } from "./LayerRow";
import {
	collectSubtreeZones,
	findNode,
	type LayerNode,
	ROOT_ZONE,
	resolveDrop,
	useLayerTree,
} from "./use-layer-tree";

/** Droppable id namespace so zone keys never collide with component ids. */
const ZONE_PREFIX = "zone:";

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
					isOver && "bg-[var(--ak-studio-muted)]",
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

export function LayerTree(): ReactNode {
	const msg = useMsg();
	const getPuck = useGetPuck();
	const { roots, selectedId } = useLayerTree();
	const [activeId, setActiveId] = useState<string | null>(null);

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

			const draggedNode = findNode(roots, draggedId);
			const draggedSubtreeZones =
				draggedNode === null
					? new Set<string>()
					: collectSubtreeZones(draggedNode);

			const action = resolveDrop({
				source: { zone: selector.zone, index: selector.index },
				dest: { zone: overData.zone, index: destIndex },
				draggedSubtreeZones,
			});
			if (action !== null) snapshot.dispatch(action);
		},
		[getPuck, roots],
	);

	const handleDragCancel = useCallback((): void => {
		setActiveId(null);
	}, []);

	const activeNode = activeId === null ? null : findNode(roots, activeId);

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
							findNode(roots, String(active.id))?.label ?? String(active.id)
						}`,
					onDragOver: () => "",
					onDragEnd: ({ active }) =>
						`${msg("studio.module.layer.layers.tree.announce.moved")} ${
							findNode(roots, String(active.id))?.label ?? String(active.id)
						}`,
					onDragCancel: () =>
						msg("studio.module.layer.layers.tree.announce.cancelled"),
				},
			}}
		>
			<div data-testid="ak-layer-tree">
				<LayerZone zoneKey={ROOT_ZONE} nodes={roots} selectedId={selectedId} />
			</div>
			<DragOverlay>
				{activeNode !== null ? (
					<div className="flex h-7 items-center gap-1 rounded bg-[var(--ak-studio-muted)] px-2 text-sm text-[var(--ak-studio-fg)] shadow-lg ring-1 ring-[var(--ak-studio-ring)]">
						{activeNode.label}
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}
