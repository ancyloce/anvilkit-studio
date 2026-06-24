/**
 * @file Single row in the Pages panel (PRD §6.4; plan 0004 P2).
 *
 * Capability-gated row affordances: the overflow menu surfaces an
 * action only when the host's `StudioPagesSource` implements the
 * matching callback. Rename and Delete additionally require
 * `page.locked !== true`; Duplicate and Settings have no `locked`
 * gate. When no action would render, the overflow trigger itself
 * is suppressed.
 *
 * The component is purposely callback-only — it never reaches back
 * to `useStudioPagesSource()` — so tests can drive it with plain
 * `vi.fn()` mocks and the parent panel keeps source-orchestration
 * concerns in one place.
 */

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	Copy,
	Globe,
	GripVertical,
	Home,
	MoreHorizontal,
	Pencil,
	Settings,
	Trash2,
} from "lucide-react";
import {
	type CSSProperties,
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/primitives/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/primitives/dropdown-menu";
import { Input } from "@/primitives/input";
import { Item, ItemMedia } from "@/primitives/item";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import type { StudioPage, StudioPagesSource } from "@/types/pages";
import { PageDeleteConfirmDialog } from "./PageDeleteConfirmDialog";
import { PageSettingsDialog } from "./PageSettingsDialog";

/** Modifier keys from a row click, used by the panel for multi-select. */
export interface SelectModifiers {
	readonly shiftKey: boolean;
	readonly metaKey: boolean;
	readonly ctrlKey: boolean;
}

export interface PageRowProps {
	readonly page: StudioPage;
	/**
	 * Activate a row. A plain click navigates; a click with `metaKey` / `ctrlKey`
	 * (toggle) or `shiftKey` (range) drives the panel's multi-selection instead.
	 */
	readonly onSelect: (id: string, modifiers?: SelectModifiers) => void;
	/** Whether this row is part of the panel's current multi-selection. */
	readonly selected?: boolean;
	readonly routeBadgeLabel: string;
	readonly onRename?: StudioPagesSource["onRename"];
	readonly onDelete?: StudioPagesSource["onDelete"];
	readonly onDuplicate?: StudioPagesSource["onDuplicate"];
	readonly onUpdateSettings?: StudioPagesSource["onUpdateSettings"];
	readonly onReorder?: StudioPagesSource["onReorder"];
}

type RowMode = "view" | "renaming";

export function PageRow({
	page,
	onSelect,
	selected,
	routeBadgeLabel,
	onRename,
	onDelete,
	onDuplicate,
	onUpdateSettings,
	onReorder,
}: PageRowProps): ReactNode {
	const msg = useMsg();
	const label = page.title.length > 0 ? page.title : (page.path ?? page.id);
	const locked = page.locked === true;
	// The Home icon used to be a string heuristic on `page.id === "home"`;
	// hosts now signal it explicitly via `StudioPage.locked` (PRD §6 risk-6).
	const isHome = locked;
	const canRename = typeof onRename === "function" && !locked;
	const canDelete = typeof onDelete === "function" && !locked;
	const canDuplicate = typeof onDuplicate === "function";
	const canSettings = typeof onUpdateSettings === "function";
	const canReorder = typeof onReorder === "function";
	const hasAnyAction = canRename || canDuplicate || canDelete || canSettings;

	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: page.id });
	const sortableStyle: CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.4 : undefined,
	};

	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [duplicating, setDuplicating] = useState(false);

	const handleDeleteConfirm = useCallback(async (): Promise<void> => {
		if (typeof onDelete !== "function") return;
		await onDelete(page.id);
	}, [onDelete, page.id]);

	const handleDuplicate = useCallback(async (): Promise<void> => {
		if (typeof onDuplicate !== "function" || duplicating) return;
		setDuplicating(true);
		try {
			const result = await onDuplicate(page.id);
			if (
				result !== undefined &&
				result !== null &&
				typeof result === "object" &&
				"id" in result &&
				typeof result.id === "string"
			) {
				onSelect(result.id);
			}
		} finally {
			setDuplicating(false);
		}
	}, [duplicating, onDuplicate, onSelect, page.id]);

	const [mode, setMode] = useState<RowMode>("view");
	const [draft, setDraft] = useState<string>(page.title);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (mode === "renaming") inputRef.current?.focus();
	}, [mode]);

	const startRename = useCallback(() => {
		setDraft(page.title);
		setError(null);
		setMode("renaming");
	}, [page.title]);

	const exitRename = useCallback(() => {
		setMode("view");
		setPending(false);
		setError(null);
	}, []);

	const commit = useCallback(async (): Promise<void> => {
		if (pending) return;
		const next = draft.trim();
		if (next.length === 0) {
			setError(msg("studio.module.layer.pages.rename.error.empty"));
			return;
		}
		if (next === page.title) {
			exitRename();
			return;
		}
		if (typeof onRename !== "function") {
			exitRename();
			return;
		}
		setPending(true);
		setError(null);
		try {
			await onRename({ id: page.id, title: next });
			exitRename();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setPending(false);
		}
	}, [draft, exitRename, msg, onRename, page.id, page.title, pending]);

	const handleKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Enter") {
				event.preventDefault();
				void commit();
			} else if (event.key === "Escape") {
				event.preventDefault();
				exitRename();
			}
		},
		[commit, exitRename],
	);

	const handleBlur = useCallback(() => {
		if (pending) return;
		void commit();
	}, [commit, pending]);

	const icon: ReactNode = isHome ? (
		<Home className="size-3.5" aria-hidden="true" />
	) : page.route === true ? (
		<Tooltip>
			<TooltipTrigger
				render={
					<span className="inline-flex">
						<Globe className="size-3.5" aria-label={routeBadgeLabel} />
					</span>
				}
			/>
			<TooltipContent>{routeBadgeLabel}</TooltipContent>
		</Tooltip>
	) : (
		<span className="size-3.5" aria-hidden="true" />
	);

	if (mode === "renaming") {
		return (
			<li ref={setNodeRef} style={sortableStyle}>
				<div
					className={cn(
						"flex h-6 items-center gap-2 rounded-sm border-0 px-2 py-0 text-xs",
						"text-[var(--ak-pages-fg,var(--ak-studio-fg))]",
						"bg-[var(--ak-pages-muted,var(--ak-studio-muted))]",
					)}
					data-testid={`ak-layer-page-row-${page.id}`}
					data-renaming="true"
				>
					<ItemMedia
						variant="icon"
						className="text-[var(--ak-pages-muted-fg,var(--ak-studio-muted-fg))]"
					>
						{icon}
					</ItemMedia>
					<Input
						ref={inputRef}
						aria-label={msg("studio.module.layer.pages.rename.placeholder")}
						placeholder={msg("studio.module.layer.pages.rename.placeholder")}
						value={draft}
						disabled={pending}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={handleKeyDown}
						onBlur={handleBlur}
						data-testid={`ak-layer-page-row-${page.id}-rename-input`}
						className="h-5 min-w-0 flex-1 px-1 text-xs"
					/>
				</div>
				{error !== null ? (
					<p
						role="alert"
						className="px-2 pt-1 text-[10px] text-[var(--ak-pages-danger-bg,var(--destructive))]"
						data-testid={`ak-layer-page-row-${page.id}-rename-error`}
					>
						{error}
					</p>
				) : null}
			</li>
		);
	}

	return (
		<li
			ref={setNodeRef}
			style={sortableStyle}
			className="group/page-row relative"
		>
			<Item
				render={
					<Button
						type="button"
						variant="ghost"
						onClick={(event) =>
							onSelect(page.id, {
								shiftKey: event.shiftKey,
								metaKey: event.metaKey,
								ctrlKey: event.ctrlKey,
							})
						}
						aria-current={page.active === true ? "page" : undefined}
						// Visual-only selection state. `aria-selected` is omitted on
						// purpose: it is meaningful only on listbox/option-style roles,
						// not a plain button (report 0003 P2-7a — proper selectable-list
						// semantics is a follow-up).
						data-active={page.active === true ? "true" : undefined}
						data-selected={selected === true ? "true" : undefined}
						data-testid={`ak-layer-page-row-${page.id}`}
					/>
				}
				className={cn(
					"h-7 rounded-sm border-0 px-2 py-0 text-left text-xs font-normal",
					"text-[var(--ak-pages-fg,var(--ak-studio-fg))]",
					"hover:bg-[var(--ak-pages-muted,var(--ak-studio-muted))]",
					"focus-visible:ring-2 focus-visible:ring-[var(--ak-pages-ring,var(--ak-studio-ring))]",
					"data-[active=true]:bg-[var(--ak-pages-muted,var(--ak-studio-muted))] data-[active=true]:text-[var(--ak-pages-fg,var(--ak-studio-fg))]",
					"data-[selected=true]:bg-[var(--ak-pages-muted,var(--ak-studio-muted))] data-[selected=true]:ring-1 data-[selected=true]:ring-inset data-[selected=true]:ring-[var(--ak-pages-ring,var(--ak-studio-ring))]",
					hasAnyAction ? "pr-7" : "",
					canReorder ? "pl-6" : "",
				)}
			>
				<ItemMedia
					variant="icon"
					className="text-[var(--ak-pages-muted-fg,var(--ak-studio-muted-fg))]"
				>
					{icon}
				</ItemMedia>
				<span className="min-w-0 flex-1 truncate">{label}</span>
			</Item>
			{canReorder ? (
				// The drag handle is a sibling of the select control — not a
				// child of it — so we never nest one <button> inside another
				// (invalid HTML / hydration error). Mirrors the overflow-menu
				// overlay on the right.
				<div className="pointer-events-none absolute top-1/2 left-1 -translate-y-1/2 opacity-0 transition-opacity group-hover/page-row:opacity-100 group-focus-within/page-row:opacity-100">
					<Button
						{...attributes}
						{...listeners}
						ref={setActivatorNodeRef}
						type="button"
						variant="ghost"
						size="icon-xs"
						aria-label={msg("studio.module.layer.pages.tree.dragHandle")}
						data-testid={`ak-layer-page-row-${page.id}-drag-handle`}
						className="pointer-events-auto flex h-4 w-3 cursor-grab items-center justify-center text-[var(--ak-pages-muted-fg,var(--ak-studio-muted-fg))] active:cursor-grabbing"
					>
						<GripVertical className="size-3" aria-hidden="true" />
					</Button>
				</div>
			) : null}
			{hasAnyAction ? (
				<div className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity group-hover/page-row:opacity-100 group-focus-within/page-row:opacity-100 data-[menu-open=true]:opacity-100">
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button
									size="icon-xs"
									variant="ghost"
									aria-label={msg("studio.module.layer.pages.menu.trigger")}
									data-testid={`ak-layer-page-row-${page.id}-menu`}
									className="pointer-events-auto size-5 text-[var(--ak-pages-muted-fg,var(--ak-studio-muted-fg))] hover:bg-[var(--ak-pages-muted,var(--ak-studio-muted))] hover:text-[var(--ak-pages-fg,var(--ak-studio-fg))]"
								/>
							}
						>
							<MoreHorizontal aria-hidden="true" />
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							sideOffset={4}
							data-testid={`ak-layer-page-row-${page.id}-menu-popup`}
							// Figure-1 menu treatment: the default popup is pinned to the
							// tiny "…" trigger width (`w-(--anchor-width)`, floored at 128px)
							// and uses compact 1px padding. Widen it and add breathing room.
							// Scoped here so the shared dropdown-menu primitive — used by
							// every other Studio menu — stays untouched.
							className="w-auto min-w-[216px] p-1.5"
						>
							{canRename ? (
								<DropdownMenuItem
									onClick={startRename}
									data-testid={`ak-layer-page-row-${page.id}-menu-rename`}
									className="gap-2.5 px-2.5 py-2"
								>
									<Pencil aria-hidden="true" />
									<span>{msg("studio.module.layer.pages.menu.rename")}</span>
								</DropdownMenuItem>
							) : null}
							{canDuplicate ? (
								<DropdownMenuItem
									disabled={duplicating}
									onClick={() => {
										void handleDuplicate();
									}}
									data-testid={`ak-layer-page-row-${page.id}-menu-duplicate`}
									className="gap-2.5 px-2.5 py-2"
								>
									<Copy aria-hidden="true" />
									<span>{msg("studio.module.layer.pages.menu.duplicate")}</span>
								</DropdownMenuItem>
							) : null}
							{canSettings ? (
								<DropdownMenuItem
									onClick={() => setSettingsOpen(true)}
									data-testid={`ak-layer-page-row-${page.id}-menu-settings`}
									className="gap-2.5 px-2.5 py-2"
								>
									<Settings aria-hidden="true" />
									<span>{msg("studio.module.layer.pages.menu.settings")}</span>
								</DropdownMenuItem>
							) : null}
							{canDelete && (canRename || canSettings) ? (
								<DropdownMenuSeparator className="-mx-1.5 my-1.5" />
							) : null}
							{canDelete ? (
								<DropdownMenuItem
									variant="destructive"
									onClick={() => setConfirmingDelete(true)}
									data-testid={`ak-layer-page-row-${page.id}-menu-delete`}
									className="gap-2.5 px-2.5 py-2"
								>
									<Trash2 aria-hidden="true" />
									<span>{msg("studio.module.layer.pages.menu.delete")}</span>
								</DropdownMenuItem>
							) : null}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			) : null}
			{canDelete ? (
				<PageDeleteConfirmDialog
					open={confirmingDelete}
					onOpenChange={setConfirmingDelete}
					page={page}
					onConfirm={handleDeleteConfirm}
				/>
			) : null}
			{canSettings && typeof onUpdateSettings === "function" ? (
				<PageSettingsDialog
					open={settingsOpen}
					onOpenChange={setSettingsOpen}
					page={page}
					onSubmit={onUpdateSettings}
				/>
			) : null}
		</li>
	);
}
