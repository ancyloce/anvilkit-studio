/**
 * @file `<StudioLoadingScreen>` — the default skeleton shown while the
 * Studio runtime compiles.
 *
 * `<Studio>` returns this in place of the bare `null` it used to render
 * during the pre-compile window (and, for anvilkit chrome, while the
 * lazily-loaded `<StudioLayout>` + override preset resolve). It mirrors
 * the real three-pane chrome — icon rail, module panel, header,
 * toolbar, canvas — so the swap to the live editor causes minimal
 * layout shift.
 *
 * **Rendered pre-provider.** The loading gates in `Studio.tsx` `return`
 * *before* the `StudioConfigProvider` / `EditorI18nProvider` /
 * theme stack mounts, so this component must NOT call `useMsg()`,
 * `useTheme()`, or any Studio context hook — they would throw. The
 * visible status text is therefore a plain `label` prop (default in
 * English); a host that wants a localized string passes its own.
 *
 * The structural chrome reads the same `--ak-studio-*` tokens as
 * `<StudioLayout>` (defined on `:root` in `overrides/styles.css`), and
 * the placeholder blocks reuse the shared {@link Skeleton} primitive;
 * the canvas centers a {@link Spinner} + the status label. Because it
 * introduces new Tailwind utility strings, the package's compiled
 * `styles.css` must be rebuilt (`pnpm build` → `rslib build` +
 * `build:css`) for the classes to ship.
 */

import type { ReactNode } from "react";

import { Skeleton } from "@/primitives/skeleton";
import { Spinner } from "@/primitives/spinner";
import { cn } from "@/shared/cn";

export interface StudioLoadingScreenProps {
	/**
	 * Status text shown beneath the canvas spinner. Defaults to a plain
	 * English string — this node renders before the i18n provider mounts,
	 * so a host that needs a translated label passes it explicitly
	 * (e.g. `loading={<StudioLoadingScreen label={t("editor.loading")} />}`).
	 */
	readonly label?: string;
	/** Extra classes merged onto the outer shell. */
	readonly className?: string;
}

/** Vertical icon-rail placeholder (mirrors `<SidebarRail>`). */
function RailSkeleton(): ReactNode {
	return (
		<div
			className="flex h-full shrink-0 flex-col items-center border-e border-[var(--ak-studio-border)] bg-[var(--editor-panel)]"
			style={{ inlineSize: "var(--ak-studio-rail-width)" }}
		>
			<div className="flex h-12 w-full shrink-0 items-center justify-center border-b border-[var(--ak-studio-border)]">
				<Skeleton className="size-8 rounded-full" />
			</div>
			<div className="flex flex-col items-center gap-2 pt-2">
				{RAIL_TABS.map((id) => (
					<Skeleton key={id} className="size-8 rounded-md" />
				))}
			</div>
		</div>
	);
}

// Stable keys (no array-index keys) for the placeholder block lists.
const RAIL_TABS = ["insert", "layer", "image", "text", "more"] as const;

/**
 * Default skeleton chrome rendered while `<Studio>` compiles its plugin
 * runtime. Exported from `@anvilkit/core/react` so hosts can also pass
 * it explicitly: `<Studio loading={<StudioLoadingScreen />} />`.
 */
export function StudioLoadingScreen({
	label = "Loading editor…",
	className,
}: StudioLoadingScreenProps = {}): ReactNode {
	return (
		<div
			data-testid="studio-loading"
			aria-busy="true"
			className={cn(
				"flex h-screen min-h-0 w-full overflow-hidden bg-[var(--ak-studio-bg)] text-[var(--ak-studio-fg)]",
				className,
			)}
		>
			<RailSkeleton />
			<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				{/* Header */}
				<div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--ak-studio-border)] bg-[var(--editor-topbar)] px-3">
					<Skeleton className="size-8 rounded-md" />
					<div className="mx-auto flex items-center gap-2">
						<Skeleton className="h-4 w-16" />
						<Skeleton className="h-4 w-24" />
					</div>
					<div className="ml-auto flex items-center gap-2">
						<Skeleton className="h-8 w-20 rounded-md" />
						<Skeleton className="size-8 rounded-md" />
						<Skeleton className="h-8 w-24 rounded-md" />
					</div>
				</div>
				{/* Toolbar */}
				<div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)] px-3">
					<Skeleton className="h-5 w-16" />
					<Skeleton className="h-5 w-16" />
					<Skeleton className="h-5 w-16" />
				</div>
				{/* Canvas — spinner + status label */}
				<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-[var(--editor-workspace)]">
					<Spinner className="size-6 text-[var(--ak-studio-muted-fg)]" />
					<p className="text-sm text-[var(--ak-studio-muted-fg)]">{label}</p>
				</div>
			</div>
		</div>
	);
}
