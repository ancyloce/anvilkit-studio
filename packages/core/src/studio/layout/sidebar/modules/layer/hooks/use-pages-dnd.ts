/**
 * @file Flat-list dnd-kit glue for the Pages panel (plan 0004 P5).
 *
 * Encapsulates pointer + keyboard sensor setup, drag-active id state,
 * and the pure index-math helpers used by `PagesPanel`'s
 * `<DndContext>`. Kept narrow on purpose — pages are a flat list so
 * we never need `LayerTree`'s multi-zone / cycle-guard machinery
 * (cf. plan §3.2 component topology).
 *
 * The hook is a no-op (`onDragEnd` returns without calling back) when
 * `onReorder` is undefined — `PageRow` separately marks the drag
 * handle inert in that case, but defending here too keeps the
 * surface honest if a host wires `DndContext` directly.
 */

import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useCallback, useState } from "react";
import type { StudioPage, StudioPagesSource } from "@/types/pages";

/**
 * Resolve the `toIndex` for a flat-list reorder drop. Returns `null`
 * when the drop is a no-op (same row, missing target, or unknown id).
 *
 * Pure — exported for direct unit-testing without rendering a real
 * `<DndContext>`.
 */
export function computeReorderIndex(
	pages: readonly StudioPage[],
	activeId: string,
	overId: string | null,
): number | null {
	if (overId === null || activeId === overId) return null;
	const toIndex = pages.findIndex((page) => page.id === overId);
	if (toIndex < 0) return null;
	const fromIndex = pages.findIndex((page) => page.id === activeId);
	if (fromIndex < 0) return null;
	if (fromIndex === toIndex) return null;
	return toIndex;
}

export interface UsePagesDndArgs {
	readonly pages: readonly StudioPage[];
	readonly onReorder: StudioPagesSource["onReorder"];
}

export interface UsePagesDndResult {
	readonly sensors: ReturnType<typeof useSensors>;
	readonly activeId: string | null;
	readonly activePage: StudioPage | null;
	readonly handleDragStart: (event: DragStartEvent) => void;
	readonly handleDragEnd: (event: DragEndEvent) => void;
	readonly handleDragCancel: () => void;
}

export function usePagesDnd({
	pages,
	onReorder,
}: UsePagesDndArgs): UsePagesDndResult {
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);
	const [activeId, setActiveId] = useState<string | null>(null);

	const handleDragStart = useCallback((event: DragStartEvent): void => {
		setActiveId(String(event.active.id));
	}, []);

	const handleDragEnd = useCallback(
		(event: DragEndEvent): void => {
			setActiveId(null);
			if (typeof onReorder !== "function") return;
			const { active, over } = event;
			const overId = over === null ? null : String(over.id);
			const toIndex = computeReorderIndex(pages, String(active.id), overId);
			if (toIndex === null) return;
			void onReorder({ id: String(active.id), toIndex });
		},
		[onReorder, pages],
	);

	const handleDragCancel = useCallback((): void => {
		setActiveId(null);
	}, []);

	const activePage =
		activeId === null
			? null
			: (pages.find((page) => page.id === activeId) ?? null);

	return {
		sensors,
		activeId,
		activePage,
		handleDragStart,
		handleDragEnd,
		handleDragCancel,
	};
}
