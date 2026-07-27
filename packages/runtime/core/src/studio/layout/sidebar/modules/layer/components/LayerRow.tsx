"use client";

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
 *
 * Visual-editor affordances (CORE-P1A-010/-011, ED-LAYER-001..003)
 * appear only when the enclosing `<Studio>` enables the editor — the
 * legacy row stays byte-identical otherwise:
 *
 * - display name prefers authoring metadata over the component label;
 *   double-click renames through `node.rename` (Escape cancels);
 * - hide / lock toggles (`node.visibility.set` / `node.lock.set`,
 *   keyboard-complete buttons); hidden rows render translucent but
 *   stay selectable; locked rows (or rows under a locked ancestor)
 *   cannot be dragged or keyboard-reordered;
 * - selection clicks route through the multi-selection controller:
 *   plain = select, ctrl/meta = toggle, shift = range by visible
 *   order.
 */

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useGetPuck } from "@puckeditor/core";
import {
	Box,
	ChevronDown,
	ChevronRight,
	Eye,
	EyeOff,
	GripVertical,
	Lock,
	LockOpen,
} from "lucide-react";
import {
	type KeyboardEvent,
	type MouseEvent,
	memo,
	type ReactNode,
	useCallback,
	useState,
} from "react";
import { Button } from "@/primitives/button";
import { Input } from "@/primitives/input";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import { useEditorLayers } from "../hooks/use-editor-layers";
import type { LayerNode } from "../hooks/use-layer-tree";
import { useScrollComponentIntoView } from "../hooks/use-scroll-component-into-view";

interface LayerRowProps {
	readonly node: LayerNode;
	readonly selected: boolean;
	readonly expanded: boolean;
	readonly hasChildren: boolean;
	/** Number of siblings in `node.zone` — clamps keyboard reorder. */
	readonly siblingCount: number;
	/**
	 * Stable per-tree toggle handler. Takes `(id, next)` rather than a
	 * per-row closure so its identity is constant across renders and
	 * the `React.memo` boundary actually holds at large node counts.
	 */
	readonly onToggleExpand: (id: string, next: boolean) => void;
	/**
	 * True when this node or an ancestor is locked (computed by the
	 * tree — fences drag/reorder; ED-LAYER-003). Only ever true while
	 * the editor feature is on.
	 */
	readonly effectiveLocked?: boolean;
}

function LayerRowImpl({
	node,
	selected,
	expanded,
	hasChildren,
	siblingCount,
	onToggleExpand,
	effectiveLocked = false,
}: LayerRowProps): ReactNode {
	const msg = useMsg();
	const getPuck = useGetPuck();
	const scrollIntoView = useScrollComponentIntoView();
	const editor = useEditorLayers();
	const [renameDraft, setRenameDraft] = useState<string | null>(null);

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
		// Locked-ancestor fencing: the drag handle goes inert (the row
		// stays selectable — locked nodes are selectable-not-mutable).
		disabled: editor !== null && effectiveLocked,
	});

	const select = useCallback(
		(event?: MouseEvent): void => {
			if (editor !== null) {
				if (event?.shiftKey) {
					editor.selection.selectRange(node.id);
				} else if (event?.metaKey || event?.ctrlKey) {
					editor.selection.toggle(node.id);
				} else {
					editor.selection.select(node.id);
				}
				scrollIntoView(node.id);
				return;
			}
			const selector = getPuck().getSelectorForId(node.id);
			if (selector === undefined) return;
			getPuck().dispatch({ type: "setUi", ui: { itemSelector: selector } });
			scrollIntoView(node.id);
		},
		[editor, getPuck, node.id, scrollIntoView],
	);

	const handleGripKeyDown = useCallback(
		(event: KeyboardEvent<HTMLButtonElement>): void => {
			if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
			event.preventDefault();
			if (editor !== null && effectiveLocked) return;
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
		[editor, effectiveLocked, getPuck, node.id, siblingCount],
	);

	const displayName = editor?.nameOf(node.id, node.label) ?? node.label;
	const hidden = editor?.isHidden(node.id) ?? false;
	const lockedSelf = editor?.isLocked(node.id) ?? false;
	const multiSelected = editor?.isSelected(node.id) ?? false;
	const isSelected = selected || multiSelected;

	const commitRename = (): void => {
		if (editor === null || renameDraft === null) return;
		const trimmed = renameDraft.trim();
		setRenameDraft(null);
		void editor.rename(node.id, trimmed === "" ? null : trimmed);
	};

	const showDropLine = isOver && active !== null && active.id !== node.id;

	return (
		// §27.6 "correct tree/panel roles" (PLAN-0020 CORE-P4-003): the
		// Layers panel IS the document structure, and without tree
		// semantics a screen-reader user gets an undifferentiated pile of
		// buttons with no hierarchy, position, or expanded state. The
		// whole row is the item (it owns selection and the child zone),
		// so the role lives here rather than on the name button.
		<div
			ref={setNodeRef}
			role="treeitem"
			aria-selected={isSelected}
			aria-level={node.depth + 1}
			aria-expanded={hasChildren ? expanded : undefined}
			data-testid={`ak-layer-node-${node.id}`}
			data-selected={isSelected ? "true" : undefined}
			data-dragging={isDragging ? "true" : undefined}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				paddingLeft: `${node.depth * 16 + 4}px`,
			}}
			className={cn(
				"relative",
				isDragging && "opacity-70 shadow-[var(--shadow-floating)]",
			)}
		>
			{showDropLine ? (
				<span
					aria-hidden="true"
					className="pointer-events-none absolute inset-x-1 -top-px h-0.5 rounded bg-[var(--editor-selection)]"
				/>
			) : null}
			<div
				className={cn(
					"group flex h-8 items-center gap-1 rounded-md px-1 text-xs",
					"text-[var(--ak-studio-fg)] hover:bg-[var(--ak-studio-muted)]",
					isSelected &&
						"bg-[var(--editor-selection-soft)] ring-1 ring-inset ring-[var(--editor-selection)] hover:bg-[var(--editor-selection-soft)]",
					// §18 "show hidden nodes": translucent placeholder in the
					// tree (design mode only); still fully selectable.
					hidden && "opacity-50",
				)}
			>
				<Button
					ref={setActivatorNodeRef}
					type="button"
					variant="ghost"
					size="icon-xs"
					aria-label={msg("studio.module.layer.layers.tree.dragHandle")}
					data-testid={`ak-layer-grip-${node.id}`}
					className={cn(
						"flex size-5 shrink-0 items-center justify-center text-[var(--ak-studio-muted-fg)] hover:text-[var(--ak-studio-fg)]",
						editor !== null && effectiveLocked
							? "cursor-not-allowed opacity-40"
							: "cursor-grab active:cursor-grabbing",
					)}
					onKeyDown={handleGripKeyDown}
					{...attributes}
					{...listeners}
				>
					<GripVertical className="size-3.5" aria-hidden="true" />
				</Button>

				{hasChildren ? (
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						aria-label={msg(
							expanded
								? "studio.module.layer.layers.tree.collapse"
								: "studio.module.layer.layers.tree.expand",
						)}
						aria-expanded={expanded}
						data-testid={`ak-layer-toggle-${node.id}`}
						className="flex size-5 shrink-0 items-center justify-center text-[var(--ak-studio-muted-fg)] hover:text-[var(--ak-studio-fg)]"
						onClick={() => onToggleExpand(node.id, !expanded)}
					>
						{expanded ? (
							<ChevronDown className="size-3.5" aria-hidden="true" />
						) : (
							<ChevronRight className="size-3.5" aria-hidden="true" />
						)}
					</Button>
				) : (
					<span className="size-5 shrink-0" aria-hidden="true" />
				)}

				<Box
					className="size-3.5 shrink-0 text-[var(--ak-studio-muted-fg)]"
					aria-hidden="true"
				/>

				{editor !== null && renameDraft !== null ? (
					<Input
						autoFocus
						value={renameDraft}
						aria-label={msg("studio.editor.layers.rename")}
						className="h-6 grow text-xs"
						data-testid={`ak-layer-rename-${node.id}`}
						onChange={(event) => setRenameDraft(event.target.value)}
						onBlur={commitRename}
						onKeyDown={(event) => {
							if (event.key === "Enter") commitRename();
							if (event.key === "Escape") setRenameDraft(null);
						}}
					/>
				) : (
					/* `aria-selected` deliberately NOT here: `button` does not
					   support it (axe `aria-allowed-attr`, critical), and the
					   selected state now lives on the enclosing `treeitem` row
					   where it IS valid — one source of truth, announced once
					   (PLAN-0020 CORE-P4-003). `data-selected` on the row
					   remains the styling/testing hook. */
					<Button
						type="button"
						variant="ghost"
						data-testid={`ak-layer-select-${node.id}`}
						/* `focus:` — not only the base recipe's `focus-visible:` —
						   because `buttonVariants` sets `outline-none`, and
						   Chromium does not match `:focus-visible` for a button
						   focused by script after a pointer interaction. A row
						   receives focus that way on every path that is not a
						   Tab press: selection sync, rename cancel, and
						   assistive-technology focus moves. WCAG 2.4.7 wants the
						   indicator whenever the row HAS focus, not only when
						   the heuristic guesses "keyboard" — so the ring is
						   bound to `:focus` and the base recipe keeps painting
						   its own on top for keyboard users. Regression-gated by
						   `e2e/editor/a11y-acceptance.spec.ts` ("focus is
						   visibly indicated on editor controls"). */
						className="grow truncate text-left justify-start outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
						onClick={select}
						onDoubleClick={
							editor !== null ? () => setRenameDraft(displayName) : undefined
						}
					>
						{displayName}
					</Button>
				)}

				{editor !== null ? (
					<span
						className={cn(
							"flex shrink-0 items-center",
							// Keep toggles discoverable but quiet: visible when
							// active, on row hover, and on keyboard focus.
							!hidden &&
								!lockedSelf &&
								"opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
						)}
					>
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-label={msg(
								hidden
									? "studio.editor.layers.show"
									: "studio.editor.layers.hide",
							)}
							aria-pressed={hidden}
							data-testid={`ak-layer-hide-${node.id}`}
							className="flex size-5 shrink-0 items-center justify-center text-[var(--ak-studio-muted-fg)] hover:text-[var(--ak-studio-fg)]"
							onClick={() => void editor.setHidden([node.id], !hidden)}
						>
							{hidden ? (
								<EyeOff className="size-3.5" aria-hidden="true" />
							) : (
								<Eye className="size-3.5" aria-hidden="true" />
							)}
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-label={msg(
								lockedSelf
									? "studio.editor.layers.unlock"
									: "studio.editor.layers.lock",
							)}
							aria-pressed={lockedSelf}
							data-testid={`ak-layer-lock-${node.id}`}
							className="flex size-5 shrink-0 items-center justify-center text-[var(--ak-studio-muted-fg)] hover:text-[var(--ak-studio-fg)]"
							onClick={() => void editor.setLocked([node.id], !lockedSelf)}
						>
							{lockedSelf ? (
								<Lock className="size-3.5" aria-hidden="true" />
							) : (
								<LockOpen className="size-3.5" aria-hidden="true" />
							)}
						</Button>
					</span>
				) : null}
			</div>
		</div>
	);
}

/**
 * Memoized so a selection change re-renders only the rows whose
 * `selected`/`expanded` actually flipped, not the entire visible
 * subtree (review §2.3 — editor jank at 100+ nodes). Holds only
 * because `onToggleExpand` is a stable per-tree handler. Editor-state
 * changes (names, hidden/locked, multi-selection) re-render through
 * `useEditorLayers`' own bridge subscription, which bypasses the memo
 * boundary by design.
 */
export const LayerRow = memo(LayerRowImpl);
