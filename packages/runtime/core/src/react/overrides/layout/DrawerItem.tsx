/**
 * @file `DrawerItem` — single component card in the insert drawer.
 *
 * Receives `{ name, children }` from Puck's `drawerItem` override.
 * `children` is Puck's draggable node — we place it in the ItemHeader
 * preview surface and render the component name as the tile caption.
 */

import { type ReactNode } from "react";

import { Item, ItemContent, ItemHeader, ItemTitle } from "@/primitives";

export interface DrawerItemProps {
	readonly name: string;
	readonly image?: string;
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

export function DrawerItem({
	name,
	image,
	children,
}: DrawerItemProps): ReactNode {
	const hasImage = image !== undefined && image.trim().length > 0;

	return (
		<Item
			variant="outline"
			size="xs"
			className="group/drawer-item h-full cursor-grab items-stretch rounded-md bg-[var(--ak-studio-muted)] p-0 text-center text-[var(--ak-studio-fg)] hover:border-[var(--ak-studio-accent)] active:cursor-grabbing overflow-hidden"
			data-drawer-item={name}
		>
			<ItemHeader className="relative aspect-[4/3] h-auto w-full overflow-hidden">
				{hasImage ? (
					<img
						src={image}
						alt={`${name} preview`}
						draggable={false}
						className="size-full object-cover"
					/>
				) : (
					<DrawerItemPlaceholder />
				)}
				<div aria-hidden="true" className="absolute inset-0 opacity-0">
					{children}
				</div>
			</ItemHeader>
			<ItemContent className="basis-full min-w-0 items-center gap-0">
				<ItemTitle className="w-full p-2 pt-0 justify-center truncate text-[11px] leading-tight font-medium text-[var(--ak-studio-muted-fg)]">
					{name}
				</ItemTitle>
			</ItemContent>
		</Item>
	);
}
