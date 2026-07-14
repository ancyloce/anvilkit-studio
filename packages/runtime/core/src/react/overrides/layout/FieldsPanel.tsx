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
 */

import { ChevronRight } from "lucide-react";
import { type ReactNode } from "react";
import { useBreadcrumbs } from "@/overrides/utils/breadcrumbs";
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

	const current = crumbs[crumbs.length - 1];
	const ancestors = crumbs.slice(0, -1);

	return (
		<div className={cn("flex h-full min-h-0 flex-col", className)}>
			<header className="sticky top-0 z-10 flex shrink-0 flex-col justify-center gap-0.5 border-b border-[var(--ak-studio-border)] bg-[var(--editor-panel)] px-3 py-2">
				{ancestors.length > 0 ? (
					<nav
						aria-label={msg("studio.fields.breadcrumbs.label")}
						className="flex items-center gap-0.5 text-[11px] text-[var(--ak-studio-muted-fg)]"
					>
						{ancestors.map((crumb) => (
							<span key={crumb.id} className="flex items-center gap-0.5">
								<span>{crumb.label}</span>
								<ChevronRight
									className="size-3 opacity-60"
									aria-hidden="true"
								/>
							</span>
						))}
					</nav>
				) : null}
				<h2
					className="truncate text-sm font-medium text-[var(--ak-studio-fg)]"
					data-testid="ak-fields-panel-title"
				>
					{current?.label}
				</h2>
			</header>
			<div className="min-h-0 flex-1 overflow-auto px-3 py-2.5">
				<div
					className={cn(
						"flex flex-col gap-3",
						isLoading ? "animate-pulse opacity-70" : null,
					)}
				>
					{children}
				</div>
			</div>
		</div>
	);
}
