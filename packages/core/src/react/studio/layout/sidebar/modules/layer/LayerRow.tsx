/**
 * @file `LayerRow` — one sortable row in the Layer tree.
 *
 * Renders a single component as a draggable, selectable row with an
 * optional expand toggle for components that own child zones. The drag
 * grip is the activator handle (so the whole row stays clickable for
 * selection); `useSortable` supplies transform/transition and the
 * `isDragging` / `isOver` state used for visual feedback. Keyboard
 * reordering (ArrowUp/ArrowDown on the focused grip) mirrors the
 * `ArrayField` a11y convention and complements dnd-kit's KeyboardSensor.
 */

import { useGetPuck } from "@puckeditor/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Box, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useCallback } from "react";
import { cn } from "@/overrides/utils/cn";
import { useMsg } from "@/state/editor-i18n-store";
import type { LayerNode } from "./use-layer-tree";

interface LayerRowProps {
	readonly node: LayerNode;
	readonly selected: boolean;
	readonly expanded: boolean;
	readonly hasChildren: boolean;
	/** Number of siblings in `node.zone` — clamps keyboard reorder. */
	readonly siblingCount: number;
	readonly onToggleExpand: () => void;
}

export function LayerRow({
	node,
	selected,
	expanded,
	hasChildren,
	siblingCount,
	onToggleExpand,
}: LayerRowProps): ReactNode {
	const msg = useMsg();
	const getPuck = useGetPuck();

	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
		isOver,
		active,
	} = useSortable({
		id: node.id,
		data: { kind: "item", zone: node.zone, index: node.index, id: node.id },
	});

	const select = useCallback((): void => {
		const selector = getPuck().getSelectorForId(node.id);
		if (selector === undefined) return;
		getPuck().dispatch({ type: "setUi", ui: { itemSelector: selector } });
	}, [getPuck, node.id]);

	const handleGripKeyDown = useCallback(
		(event: KeyboardEvent<HTMLButtonElement>): void => {
			if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
			event.preventDefault();
			const selector = getPuck().getSelectorForId(node.id);
			if (selector === undefined) return;
			const delta = event.key === "ArrowUp" ? -1 : 1;
			const next = selector.index + delta;
			if (next < 0 || next >= siblingCount) return;
			getPuck().dispatch({
				type: "reorder",
				sourceIndex: selector.index,
				destinationIndex: next,
				destinationZone: selector.zone,
			});
		},
		[getPuck, node.id, siblingCount],
	);

	const showDropLine = isOver && active !== null && active.id !== node.id;

	return (
		<div
			ref={setNodeRef}
			data-testid={`ak-layer-node-${node.id}`}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				paddingLeft: `${node.depth * 14 + 4}px`,
			}}
			className={cn("relative", isDragging && "opacity-50")}
		>
			{showDropLine ? (
				<span
					aria-hidden="true"
					className="pointer-events-none absolute inset-x-1 -top-px h-0.5 rounded bg-[var(--ak-studio-accent)]"
				/>
			) : null}
			<div
				className={cn(
					"flex h-7 items-center gap-1 rounded px-1 text-sm",
					"text-[var(--ak-studio-fg)] hover:bg-[var(--ak-studio-muted)]",
					selected &&
						"bg-[var(--ak-studio-muted)] ring-1 ring-[var(--ak-studio-ring)]",
				)}
			>
				<button
					ref={setActivatorNodeRef}
					type="button"
					aria-label={msg("studio.module.layer.layers.tree.dragHandle")}
					data-testid={`ak-layer-grip-${node.id}`}
					className="flex size-5 shrink-0 cursor-grab items-center justify-center text-[var(--ak-studio-muted-fg)] hover:text-[var(--ak-studio-fg)] active:cursor-grabbing"
					onKeyDown={handleGripKeyDown}
					{...attributes}
					{...listeners}
				>
					<GripVertical className="size-3.5" aria-hidden="true" />
				</button>

				{hasChildren ? (
					<button
						type="button"
						aria-label={msg(
							expanded
								? "studio.module.layer.layers.tree.collapse"
								: "studio.module.layer.layers.tree.expand",
						)}
						aria-expanded={expanded}
						data-testid={`ak-layer-toggle-${node.id}`}
						className="flex size-5 shrink-0 items-center justify-center text-[var(--ak-studio-muted-fg)] hover:text-[var(--ak-studio-fg)]"
						onClick={onToggleExpand}
					>
						{expanded ? (
							<ChevronDown className="size-3.5" aria-hidden="true" />
						) : (
							<ChevronRight className="size-3.5" aria-hidden="true" />
						)}
					</button>
				) : (
					<span className="size-5 shrink-0" aria-hidden="true" />
				)}

				<Box
					className="size-3.5 shrink-0 text-[var(--ak-studio-muted-fg)]"
					aria-hidden="true"
				/>

				<button
					type="button"
					aria-selected={selected}
					data-testid={`ak-layer-select-${node.id}`}
					className="grow truncate text-left outline-none"
					onClick={select}
				>
					{node.label}
				</button>
			</div>
		</div>
	);
}
