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
import { useBreadcrumbs } from "@/overrides/utils/breadcrumbs";
import { readComponentPresentation } from "@/overrides/utils/component-presentation";
import { useReactivePuck } from "@/overrides/utils/use-reactive-puck";
import { Button } from "@/primitives/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/primitives/dropdown-menu";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";

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

/** Header overflow menu — duplicate / delete via Puck's own reducer. */
function ComponentActionsMenu({
	itemSelector,
}: {
	readonly itemSelector: ItemSelector;
}): ReactNode {
	const msg = useMsg();
	// `dispatch` is a stable function on the Puck store — selecting it
	// never re-renders this component on unrelated state changes.
	const dispatch = useReactivePuck((s) => s.dispatch);
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
					onClick={() =>
						dispatch({
							type: "duplicate",
							sourceIndex: itemSelector.index,
							sourceZone: zone,
						})
					}
				>
					<Copy aria-hidden="true" />
					<span>{msg("studio.fields.actions.duplicate")}</span>
				</DropdownMenuItem>
				<DropdownMenuItem
					variant="destructive"
					onClick={() =>
						dispatch({ type: "remove", index: itemSelector.index, zone })
					}
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
			<div className="min-h-0 flex-1 overflow-auto px-3 py-2.5">
				<div
					className={cn(
						"flex flex-col gap-3",
						isLoading ? "animate-pulse opacity-70" : null,
					)}
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
			</div>
		</div>
	);
}
