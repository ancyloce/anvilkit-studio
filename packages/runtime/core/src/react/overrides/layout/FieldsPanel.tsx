"use client";

/**
 * @file `FieldsPanel` — Puck `fields` override.
 *
 * Wraps the field tree with a sticky header that always shows the
 * selected component's real display name (DESIGN.md §7.8 — never a
 * generic "Root" label when a real component is selected), plus an
 * ancestor breadcrumb trail above it when the selection is nested.
 * Puck passes `{ children, isLoading, itemSelector }`; the header
 * itself is derived from the live snapshot via `useBreadcrumbs()` so
 * it updates in lockstep with canvas / layer-tree selection. Renders
 * a quiet empty state instead of a blank pane when nothing is
 * selected, so the inspector can stay permanently mounted (no
 * abrupt structural jump when selection is cleared).
 *
 * Header extras: a subtle component-type icon (resolved from the
 * component's own `metadata.icon`, the same presentation channel the
 * Insert panel reads) and a `⋯` overflow menu with the component
 * actions Puck's action bar exposes (duplicate / delete), dispatched
 * through Puck's own reducer so undo history stays intact.
 *
 * Section grouping: Puck hands this override one child element per
 * field, each carrying `fieldName` (see `FieldsChild` in
 * `@puckeditor/core`). When the selected component's *static* field
 * definitions declare `metadata.section`, those children are
 * partitioned into collapsible {@link InspectorSection} groups
 * (canonical DESIGN.md §7.8 order — content, actions, appearance,
 * layout, advanced — then custom section ids in first-appearance
 * order). Fields WITHOUT a section keep today's flat placement above
 * the grouped ones, and a config with no section metadata at all
 * renders through the exact pre-grouping path, so existing configs
 * are unaffected. Fields produced dynamically by `resolveFields`
 * that are absent from the static config simply have no metadata and
 * stay ungrouped — never dropped.
 *
 * Placement: the assembled field tree is handed to
 * {@link EditorInspectorMount}. With the visual editor on it becomes
 * the `properties` tab of the four-tab inspector (style / properties /
 * data / animation); with the editor off it is the panel body, exactly
 * as before. This panel keeps owning selection, breadcrumbs, the
 * header and the component actions in both shapes.
 */

import { ChevronRight, Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { Children, isValidElement, type ReactNode, useMemo } from "react";
import {
	CANONICAL_FIELD_SECTIONS,
	fieldSectionTitleKey,
	isCanonicalFieldSection,
	readFieldPresentation,
} from "@/overrides/fields/field-presentation";
import { InspectorSection } from "@/overrides/layout/InspectorSection";
import { Button } from "@/primitives/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/primitives/dropdown-menu";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import { useBreadcrumbs } from "@/utils/breadcrumbs";
import { readComponentPresentation } from "@/utils/component-presentation";
import { useReactivePuck } from "@/utils/use-reactive-puck";
import { useEditorTreeActions } from "../../editor/tree-actions.js";

interface ItemSelector {
	readonly index: number;
	readonly zone?: string;
}

export interface FieldsPanelOverrideProps {
	readonly children: ReactNode;
	readonly isLoading: boolean;
	readonly itemSelector?: ItemSelector | null;
	readonly className?: string;
}

interface FieldDefLike {
	readonly metadata?: unknown;
}

interface GroupedFieldSection {
	readonly id: string;
	readonly nodes: readonly ReactNode[];
}

interface GroupedFields {
	readonly ungrouped: readonly ReactNode[];
	readonly sections: readonly GroupedFieldSection[];
}

/**
 * Partition the per-field child elements into inspector sections.
 * Returns `null` when no static field declares a section — callers
 * then render `children` verbatim (the exact pre-grouping DOM).
 */
export function groupFieldChildren(
	children: ReactNode,
	fieldDefs: Readonly<Record<string, FieldDefLike | undefined>> | undefined,
): GroupedFields | null {
	if (fieldDefs === undefined || fieldDefs === null) return null;

	const presentations = new Map<
		string,
		ReturnType<typeof readFieldPresentation>
	>();
	let anySection = false;
	for (const [name, def] of Object.entries(fieldDefs)) {
		const presentation = readFieldPresentation(def?.metadata);
		presentations.set(name, presentation);
		if (presentation.section !== undefined) anySection = true;
	}
	if (!anySection) return null;

	const ungrouped: ReactNode[] = [];
	const buckets = new Map<
		string,
		{ node: ReactNode; order: number; idx: number }[]
	>();

	Children.toArray(children).forEach((child, idx) => {
		const fieldName = isValidElement(child)
			? (child.props as { fieldName?: unknown }).fieldName
			: undefined;
		const presentation =
			typeof fieldName === "string" ? presentations.get(fieldName) : undefined;
		const section = presentation?.section;
		if (section === undefined) {
			ungrouped.push(child);
			return;
		}
		const bucket = buckets.get(section) ?? [];
		bucket.push({
			node: child,
			order: presentation?.order ?? Number.POSITIVE_INFINITY,
			idx,
		});
		buckets.set(section, bucket);
	});

	const sectionIds = [
		...CANONICAL_FIELD_SECTIONS.filter((section) => buckets.has(section)),
		...Array.from(buckets.keys()).filter(
			(section) => !isCanonicalFieldSection(section),
		),
	];

	return {
		ungrouped,
		sections: sectionIds.map((id) => {
			const entries = buckets.get(id) ?? [];
			// Stable: explicit `order` wins, authoring order breaks ties.
			entries.sort((a, b) => a.order - b.order || a.idx - b.idx);
			return { id, nodes: entries.map((entry) => entry.node) };
		}),
	};
}

/**
 * Header overflow menu — duplicate / delete. With the visual editor
 * on (and writers open), both route through the one-dispatch
 * reconciliation path (CORE-P1A-016 tier (a)) so the copy carries its
 * authoring and a delete strips its records atomically; otherwise
 * Puck's own reducer actions run unchanged.
 */
function ComponentActionsMenu({
	itemSelector,
}: {
	readonly itemSelector: ItemSelector;
}): ReactNode {
	const msg = useMsg();
	// `dispatch` is a stable function on the Puck store — selecting it
	// never re-renders this component on unrelated state changes.
	const dispatch = useReactivePuck((s) => s.dispatch);
	const selectedId = useReactivePuck(
		(s) => (s.selectedItem?.props as { id?: string } | undefined)?.id ?? null,
	);
	// `p3-009`: `useEditorNativeActions` (the command port's
	// `commitNative` pair) is gone; the canonical equivalent is
	// `commitDuplicateNodes` / `commitDeleteNodes` (`p3-005`), reached
	// through the bridge. The two-tier structure is unchanged — the
	// editor-aware path when a store is live, Puck's own reducer action
	// when it is not.
	const treeActions = useEditorTreeActions();
	const zone = itemSelector.zone ?? "root:default-zone";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						size="icon-sm"
						variant="ghost"
						aria-label={msg("studio.fields.actions.menu")}
						data-testid="ak-fields-panel-actions"
					/>
				}
			>
				<MoreHorizontal aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={4}>
				<DropdownMenuItem
					onClick={() => {
						if (treeActions !== null && selectedId !== null) {
							treeActions.duplicate(selectedId);
							return;
						}
						dispatch({
							type: "duplicate",
							sourceIndex: itemSelector.index,
							sourceZone: zone,
						});
					}}
				>
					<Copy aria-hidden="true" />
					<span>{msg("studio.fields.actions.duplicate")}</span>
				</DropdownMenuItem>
				<DropdownMenuItem
					variant="destructive"
					onClick={() => {
						if (treeActions !== null && selectedId !== null) {
							treeActions.remove(selectedId);
							return;
						}
						dispatch({ type: "remove", index: itemSelector.index, zone });
					}}
				>
					<Trash2 aria-hidden="true" />
					<span>{msg("studio.fields.actions.delete")}</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function FieldsPanel({
	children,
	isLoading,
	itemSelector,
	className,
}: FieldsPanelOverrideProps): ReactNode {
	const msg = useMsg();
	const crumbs = useBreadcrumbs();
	const hasSelection =
		itemSelector !== null && itemSelector !== undefined && crumbs.length > 0;

	const current = crumbs[crumbs.length - 1];
	// `type` is undefined for the root entry — root selections get no
	// icon and no component actions menu.
	const selectedType = current?.type;

	// Project the stable per-component config reference (same pattern as
	// `DrawerItem`) — deriving objects inside the selector would defeat
	// `Object.is` equality and re-render on every Puck state change.
	// `s.config?.` — always present in production; partial test mocks may
	// omit it, in which case presentation/grouping quietly degrade.
	const componentConfig = useReactivePuck((s) =>
		selectedType === undefined
			? undefined
			: (s.config?.components?.[selectedType] as
					| { label?: string; metadata?: unknown; fields?: unknown }
					| undefined),
	);
	const rootFields = useReactivePuck(
		(s) =>
			(s.config?.root as { fields?: unknown } | undefined)?.fields as
				| Readonly<Record<string, FieldDefLike | undefined>>
				| undefined,
	);

	const presentation = useMemo(
		() =>
			selectedType === undefined
				? undefined
				: readComponentPresentation(componentConfig, selectedType),
		[componentConfig, selectedType],
	);

	const fieldDefs =
		selectedType === undefined
			? rootFields
			: (componentConfig?.fields as
					| Readonly<Record<string, FieldDefLike | undefined>>
					| undefined);

	const grouped = useMemo(
		() => groupFieldChildren(children, fieldDefs),
		[children, fieldDefs],
	);

	if (!hasSelection) {
		return (
			<div
				className={cn(
					"flex h-full min-h-0 flex-col items-center justify-center gap-1 px-4 text-center",
					className,
				)}
				data-testid="ak-fields-panel-empty"
			>
				<p className="text-xs text-[var(--ak-studio-muted-fg)]">
					{msg("studio.fields.empty")}
				</p>
			</div>
		);
	}

	const ancestors = crumbs.slice(0, -1);

	return (
		<div className={cn("flex h-full min-h-0 flex-col", className)}>
			<header className="sticky top-0 z-10 flex shrink-0 flex-col justify-center gap-0.5 border-b border-[var(--ak-studio-border)] bg-[var(--editor-panel)] px-3 py-2">
				{ancestors.length > 0 ? (
					<nav
						aria-label={msg("studio.fields.breadcrumbs.label")}
						className="flex min-w-0 items-center gap-0.5 overflow-hidden text-[11px] text-[var(--ak-studio-muted-fg)]"
					>
						{ancestors.map((crumb) => (
							<span
								key={crumb.id}
								className="flex min-w-0 items-center gap-0.5"
							>
								<span className="max-w-24 truncate">{crumb.label}</span>
								<ChevronRight
									className="size-3 shrink-0 opacity-60"
									aria-hidden="true"
								/>
							</span>
						))}
					</nav>
				) : null}
				<div className="flex min-w-0 items-center gap-1.5">
					{presentation?.icon !== undefined ? (
						<span
							aria-hidden="true"
							data-testid="ak-fields-panel-icon"
							className="flex size-4 shrink-0 items-center justify-center text-[var(--ak-studio-muted-fg)] [&>svg]:size-4"
						>
							{presentation.icon}
						</span>
					) : null}
					<h2
						className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--ak-studio-fg)]"
						data-testid="ak-fields-panel-title"
					>
						{current?.label}
					</h2>
					{selectedType !== undefined &&
					itemSelector !== null &&
					itemSelector !== undefined ? (
						<ComponentActionsMenu itemSelector={itemSelector} />
					) : null}
				</div>
			</header>
			{/*
			 * The native field tree, in the single scroll body this panel
			 * has always rendered (ED-INSPECT-002 coexistence rule).
			 *
			 * `p3-009`: `EditorInspectorMount` used to branch here —
			 * editor-ready got the four-tab inspector (Style / Data /
			 * Interactions / Properties) and editor-off got exactly this
			 * shape. Those four tabs were the command-era inspector
			 * (`react/editor/inspector/**`, `tokens/use-design-system.ts`,
			 * `interactions/use-interactions.ts`, `bindings/use-binding-editor.ts`),
			 * every one of them a `port.execute` consumer, and they are
			 * deleted. Their canonical replacements exist and are complete —
			 * `composition/{StylePanel,DataPanel,InteractionsPanel,DesignSystemPanel}`
			 * (`p4-001`…`p4-003`, `p5-003`…`p5-005`) — but they are mounted
			 * by `StudioPuckLayout`, which `p4-009` has not yet swapped in
			 * (`Studio.tsx` still passes `overrides`). So this shell renders
			 * the degraded branch, which is the branch it always rendered
			 * with the editor off. Recorded on the deferred-verification
			 * ledger; `p4-009` closes the window.
			 */}
			<div className="min-h-0 flex-1 overflow-auto">
				{
					<div
						className={cn(
							// Dim-and-settle, not `animate-pulse`: these are the REAL fields,
							// not a skeleton, and an infinite keyframe loop made the whole
							// inspector breathe on every load. A one-way opacity transition
							// is also interruptible, so a fast load never strands a frame.
							"flex flex-col gap-3 transition-opacity duration-150 ease-out",
							isLoading ? "opacity-70" : null,
						)}
						data-testid="ak-fields-panel-native"
					>
						{grouped === null ? (
							children
						) : (
							<>
								{grouped.ungrouped}
								{grouped.sections.map((section) => (
									<InspectorSection
										key={section.id}
										id={`fields:${selectedType ?? "root"}:${section.id}`}
										title={
											isCanonicalFieldSection(section.id)
												? msg(fieldSectionTitleKey(section.id))
												: section.id
										}
										defaultExpanded={section.id !== "advanced"}
									>
										<div className="flex flex-col gap-3 pt-1 pb-2">
											{section.nodes}
										</div>
									</InspectorSection>
								))}
							</>
						)}
					</div>
				}
			</div>
		</div>
	);
}
