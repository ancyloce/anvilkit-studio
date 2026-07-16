/**
 * @file `DrawerItem` — single component card in the insert drawer.
 *
 * Receives `{ name, children }` from Puck's `drawerItem` override.
 * `children` is Puck's draggable node — we place it as an invisible
 * overlay so Puck's drag pipeline keeps owning the actual interaction;
 * everything else here is presentation only.
 *
 * task Phase 9 — presentation fallback chain (thumbnail → custom
 * preview → component icon → generic placeholder), sourced from
 * `readComponentPresentation()` (Puck's own `label`/`metadata`
 * extension points, see that file's doc for why no new metadata
 * system was introduced). Grid mode favors the thumbnail card (task:
 * "grid mode should use useful component thumbnails"); list mode
 * favors a compact icon + name + description row (task: "list mode
 * should use icon, name, and optional description") — both modes
 * render through this one component, switched by `componentViewMode`
 * read directly from the store (mirrors how `ComponentOverlay` reads
 * its own Puck state reactively rather than needing props threaded
 * through Puck's override signature).
 */

import { Component as GenericComponentIcon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { StudioErrorBoundary } from "@/components/StudioErrorBoundary";
import { readComponentPresentation } from "@/overrides/utils/component-presentation";
import { useReactivePuck } from "@/overrides/utils/use-reactive-puck";
import { Item, ItemContent, ItemHeader, ItemTitle } from "@/primitives";
import { useComponentViewMode } from "@/state/slices/editor-ui-selectors";

export interface DrawerItemProps {
	readonly name: string;
	readonly children: ReactNode;
}

/**
 * Abstract "no preview supplied" placeholder. Drawn as inline SVG (not a
 * baked data-URI) using `currentColor` at varying opacities so it adapts
 * to light/dark mode automatically instead of hardcoding a single
 * dark-mode-only hex palette.
 */
function DrawerItemPlaceholder(): ReactNode {
	return (
		<svg
			viewBox="0 0 160 120"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
			className="size-full text-[var(--ak-studio-muted-fg)]"
		>
			<rect
				width="160"
				height="120"
				rx="8"
				fill="currentColor"
				fillOpacity="0.08"
			/>
			<rect
				x="14"
				y="14"
				width="132"
				height="92"
				rx="6"
				fill="currentColor"
				fillOpacity="0.06"
			/>
			<rect
				x="26"
				y="28"
				width="74"
				height="9"
				rx="4.5"
				fill="currentColor"
				fillOpacity="0.2"
			/>
			<rect
				x="26"
				y="44"
				width="108"
				height="6"
				rx="3"
				fill="currentColor"
				fillOpacity="0.14"
			/>
			<rect
				x="26"
				y="62"
				width="42"
				height="28"
				rx="5"
				fill="currentColor"
				fillOpacity="0.12"
			/>
			<rect
				x="78"
				y="62"
				width="56"
				height="28"
				rx="5"
				fill="currentColor"
				fillOpacity="0.16"
			/>
		</svg>
	);
}

/**
 * Fallback chain: thumbnail → custom preview → component icon →
 * generic placeholder. Each tier degrades to the NEXT tier on
 * failure instead of breaking the panel: a thumbnail that 404s flips
 * local error state (`onError`), and a custom preview node that
 * throws during render is caught by a per-tile error boundary — one
 * bad component tile can never blank the whole library.
 */
function GridPreview({
	thumbnail,
	preview,
	icon,
	title,
}: {
	readonly thumbnail?: string;
	readonly preview?: ReactNode;
	readonly icon?: ReactNode;
	readonly title: string;
}): ReactNode {
	const [thumbnailFailed, setThumbnailFailed] = useState(false);

	const iconTier =
		icon !== undefined ? (
			<div className="flex size-full items-center justify-center text-[var(--ak-studio-muted-fg)] [&_svg]:size-8">
				{icon}
			</div>
		) : (
			<DrawerItemPlaceholder />
		);

	if (thumbnail !== undefined && !thumbnailFailed) {
		return (
			<img
				src={thumbnail}
				alt={`${title} preview`}
				loading="lazy"
				draggable={false}
				className="size-full object-cover"
				onError={() => setThumbnailFailed(true)}
			/>
		);
	}
	if (preview !== undefined) {
		return (
			<StudioErrorBoundary fallback={() => iconTier}>
				<div className="flex size-full items-center justify-center">
					{preview}
				</div>
			</StudioErrorBoundary>
		);
	}
	return iconTier;
}

export function DrawerItem({ name, children }: DrawerItemProps): ReactNode {
	// Select the stable `config.components[name]` reference reactively, then
	// derive the presentation via `useMemo` — computing a fresh object
	// literal directly inside the selector would never be `Object.is`-equal
	// across renders, so `useReactivePuck` would re-render in an infinite
	// loop ("Maximum update depth exceeded").
	const componentConfig = useReactivePuck(
		(s) =>
			s.config.components?.[name] as
				| { label?: string; metadata?: unknown }
				| undefined,
	);
	const presentation = useMemo(
		() => readComponentPresentation(componentConfig, name),
		[componentConfig, name],
	);
	const [viewMode] = useComponentViewMode();

	// Invisible overlay covering the whole tile — Puck's OWN draggable
	// node keeps owning drag/click, we only ever render presentation
	// around it.
	const dragOverlay = (
		<div aria-hidden="true" className="absolute inset-0 opacity-0">
			{children}
		</div>
	);

	if (viewMode === "list") {
		return (
			<Item
				variant="default"
				size="xs"
				className="group/drawer-item relative h-9 w-full cursor-grab items-center gap-2 rounded-md border-transparent bg-transparent px-2 text-left text-[var(--ak-studio-fg)] hover:bg-[var(--ak-studio-muted)] active:cursor-grabbing"
				data-drawer-item={name}
			>
				<span className="flex size-6 shrink-0 items-center justify-center rounded bg-[var(--ak-studio-muted)] text-[var(--ak-studio-muted-fg)] [&_svg]:size-3.5">
					{presentation.icon ?? <GenericComponentIcon aria-hidden="true" />}
				</span>
				<ItemContent className="min-w-0 flex-1 basis-auto gap-0">
					<ItemTitle className="truncate text-xs font-medium">
						{presentation.title}
					</ItemTitle>
					{presentation.description !== undefined ? (
						<p className="truncate text-[11px] text-[var(--ak-studio-muted-fg)]">
							{presentation.description}
						</p>
					) : null}
				</ItemContent>
				{dragOverlay}
			</Item>
		);
	}

	return (
		<Item
			variant="outline"
			size="xs"
			// Hover stays NEUTRAL (raised surface + stronger neutral border) —
			// the brand outline is reserved for the dragging state, painted by
			// the scoped `[data-dnd-dragging]` rule in styles.src.css.
			className="group/drawer-item h-full cursor-grab items-stretch rounded-md bg-[var(--ak-studio-muted)] p-0 text-center text-[var(--ak-studio-fg)] hover:border-[var(--ak-studio-muted-fg)]/35 hover:bg-[var(--editor-panel-raised)] active:cursor-grabbing overflow-hidden"
			data-drawer-item={name}
		>
			{/* 16:10, not 4:3 — task §5.4: compact ratio, no oversized cards. */}
			<ItemHeader className="relative aspect-[16/10] h-auto w-full overflow-hidden">
				<GridPreview
					thumbnail={presentation.thumbnail}
					preview={presentation.preview}
					icon={presentation.icon}
					title={presentation.title}
				/>
				{dragOverlay}
			</ItemHeader>
			<ItemContent className="basis-full min-w-0 items-center gap-0">
				<ItemTitle className="w-full p-2 pt-0 justify-center truncate text-[11px] leading-tight font-medium text-[var(--ak-studio-muted-fg)]">
					{presentation.title}
				</ItemTitle>
			</ItemContent>
		</Item>
	);
}
