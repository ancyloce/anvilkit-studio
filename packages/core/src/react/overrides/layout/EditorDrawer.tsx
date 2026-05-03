/**
 * @file `EditorDrawer` — searchable insert panel.
 *
 * Wired into the `drawer` Puck override slot. Reads `drawerSearch`
 * from the per-instance editor UI store and filters Puck's drawer
 * children (which are themselves rendered through the `drawerItem`
 * override below).
 */

import { Search } from "lucide-react";
import {
	Children,
	cloneElement,
	isValidElement,
	type ReactElement,
	type ReactNode,
} from "react";

import { Input } from "../../studio/primitives/Input.js";
import { useDrawerSearch } from "../../studio/state/hooks.js";
import { useMsg } from "../../studio/state/editor-i18n-store.js";

export interface EditorDrawerProps {
	readonly children: ReactNode;
}

interface DrawerItemElementProps {
	readonly name?: string;
}

function matchesQuery(name: string | undefined, query: string): boolean {
	if (query.length === 0) return true;
	if (name === undefined) return true;
	return name.toLowerCase().includes(query.toLowerCase());
}

function filterDrawerChildren(
	children: ReactNode,
	query: string,
): ReactNode {
	const filtered: ReactNode[] = [];
	Children.forEach(children, (child, index) => {
		if (!isValidElement(child)) {
			filtered.push(child);
			return;
		}
		const props = child.props as DrawerItemElementProps;
		if (matchesQuery(props.name, query)) {
			filtered.push(
				cloneElement(child as ReactElement, {
					key: child.key ?? `drawer-item-${index}`,
				}),
			);
		}
	});
	return filtered;
}

export function EditorDrawer({ children }: EditorDrawerProps): ReactNode {
	const msg = useMsg();
	const [query, setQuery] = useDrawerSearch();
	const filtered = filterDrawerChildren(children, query);
	const isEmpty =
		Array.isArray(filtered) && (filtered as ReactNode[]).length === 0;

	return (
		<div className="flex flex-col gap-2 p-2">
			<div className="relative">
				<Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--ak-studio-muted-fg)]" />
				<Input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder={msg("studio.drawer.searchPlaceholder")}
					className="pl-7"
					aria-label={msg("studio.drawer.searchPlaceholder")}
				/>
			</div>
			<div className="flex flex-col gap-1">
				{isEmpty ? (
					<p className="px-1 py-2 text-xs text-[var(--ak-studio-muted-fg)]">
						{msg("studio.drawer.empty")}
					</p>
				) : (
					filtered
				)}
			</div>
		</div>
	);
}
