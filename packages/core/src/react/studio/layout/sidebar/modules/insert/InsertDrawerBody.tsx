/**
 * @file Sectioned / search / view-toggle renderer for Puck's `drawer`
 * override slot — the heart of the `insert` module (PRD §5).
 *
 * Receives Puck's component-list tree, extracts the named
 * `<Drawer.Item>` leaves, and routes each one into a registered
 * {@link StudioInsertSection} (or a flat search-result list when the
 * user is searching). Sections come from the per-instance
 * `SidebarRegistryStore`; defaults are seeded by `<Studio>` on mount so
 * the first paint already shows the standard library grouping.
 *
 * The Drawer.Item children are passed through unmodified — only the
 * surrounding layout (grid vs list) and the predicate-driven grouping
 * change. Puck's drag pipeline keeps owning the inner button.
 */

import { useGetPuck } from "@puckeditor/core";
import {
	Children,
	isValidElement,
	type ReactElement,
	type ReactNode,
	useMemo,
} from "react";
import { Accordion } from "@/primitives/accordion";
import { Windowed } from "@/studio/primitives/windowed";
import {
	useComponentViewMode,
	useDrawerSearch,
	useInsertSectionsExpanded,
	useSidebarRegistry,
} from "@/state/index";
import type { StudioInsertSection } from "@/types/sidebar";
import { buildComponentCategoryIndex } from "./component-category-index";
import { InsertEmptyState } from "./InsertEmptyState";
import { InsertSection } from "./InsertSection";
import { InsertTileGrid } from "./InsertTileGrid";
import { InsertTileList } from "./InsertTileList";

/**
 * Flat search-result count at/above which the result list is
 * virtualized. Below this it keeps the exact `<FlatTiles>` markup so
 * normal catalogs and existing tests are untouched (review finding M6).
 */
const FLAT_WINDOW_THRESHOLD = 60;

interface DrawerItemElementProps {
	readonly name?: string;
	readonly children?: ReactNode;
}

function matchesQuery(name: string | undefined, query: string): boolean {
	if (query.length === 0) return true;
	if (name === undefined) return true;
	return name.toLowerCase().includes(query.toLowerCase());
}

function sortSectionsByOrder(
	sections: ReadonlyMap<string, StudioInsertSection>,
): readonly StudioInsertSection[] {
	const list = Array.from(sections.values());
	// Sections without an explicit `order` sink to the bottom so
	// plugin-contributed defaults stay above ad-hoc additions.
	list.sort(
		(a, b) =>
			(a.order ?? Number.POSITIVE_INFINITY) -
			(b.order ?? Number.POSITIVE_INFINITY),
	);
	return list;
}

function collectDrawerItems(
	children: ReactNode,
): readonly ReactElement<DrawerItemElementProps>[] {
	const items: ReactElement<DrawerItemElementProps>[] = [];

	const visit = (node: ReactNode): void => {
		Children.forEach(node, (child) => {
			if (!isValidElement(child)) return;
			const props = child.props as DrawerItemElementProps;
			if (typeof props.name === "string" && props.name.length > 0) {
				items.push(child as ReactElement<DrawerItemElementProps>);
				return;
			}
			visit(props.children);
		});
	};

	visit(children);
	return items;
}

export interface InsertDrawerBodyProps {
	readonly children: ReactNode;
}

export function InsertDrawerBody({
	children,
}: InsertDrawerBodyProps): ReactNode {
	const sections = useSidebarRegistry((s) => s.insertSections);
	const [search] = useDrawerSearch();
	const [viewMode] = useComponentViewMode();
	const [expanded, setSectionExpanded] = useInsertSectionsExpanded();

	const getPuck = useGetPuck();
	// Read the Puck Config snapshot once per render — `getPuck()` is a
	// stable getter from a vanilla store, so calling it here does not
	// subscribe us to every Puck state change. The Config's
	// `categories` map is effectively static for the lifetime of an
	// editor session, so the resulting reverse index memoizes safely.
	const config = getPuck().config;
	const categoryIndex = useMemo(
		() => buildComponentCategoryIndex(config),
		[config],
	);

	const sortedSections = useMemo(
		() => sortSectionsByOrder(sections),
		[sections],
	);

	const { sectionItems, flatMatches, totalItems } = useMemo(() => {
		const items = new Map<string, ReactNode[]>();
		for (const section of sortedSections) items.set(section.id, []);
		const flat: ReactNode[] = [];
		let total = 0;

		for (const child of collectDrawerItems(children)) {
			const name = child.props.name;
			if (name === undefined) continue;
			total += 1;
			if (search.length > 0) {
				if (!matchesQuery(name, search)) continue;
				flat.push(child);
				continue;
			}
			const category = categoryIndex.get(name);
			for (const section of sortedSections) {
				if (section.predicate(name, { category })) {
					items.get(section.id)?.push(child);
					break;
				}
			}
		}

		return { sectionItems: items, flatMatches: flat, totalItems: total };
	}, [children, search, sortedSections, categoryIndex]);

	// Empty-library state takes precedence — if Puck handed us no
	// Drawer.Items at all, neither sections nor search results matter.
	if (totalItems === 0) {
		return <InsertEmptyState variant="library" />;
	}

	if (search.length > 0) {
		if (flatMatches.length === 0) {
			return <InsertEmptyState variant="search" />;
		}
		const FlatTiles = viewMode === "grid" ? InsertTileGrid : InsertTileList;
		// Small result sets keep the exact prior markup (FlatTiles owns
		// its container/testid). Only very large flat searches switch to
		// a windowed viewport so the DOM node count stays bounded
		// (review finding M6).
		if (flatMatches.length < FLAT_WINDOW_THRESHOLD) {
			return <FlatTiles>{flatMatches}</FlatTiles>;
		}
		return (
			<div data-testid="ak-insert-flat-window-wrap">
				<Windowed
					items={flatMatches}
					itemKey={(el, i) =>
						isValidElement(el) && el.key != null ? String(el.key) : `match-${i}`
					}
					estimateSize={viewMode === "grid" ? 88 : 40}
					lanes={viewMode === "grid" ? 3 : 1}
					threshold={0}
					data-testid="ak-insert-flat-window"
					renderItem={(el) => el}
				/>
			</div>
		);
	}

	const expandedIds = sortedSections
		.filter((section) => expanded[section.id] !== false)
		.map((section) => section.id);

	const handleAccordionChange = (next: readonly string[]): void => {
		const nextSet = new Set(next);
		for (const section of sortedSections) {
			const wasOpen = expanded[section.id] !== false;
			const isOpen = nextSet.has(section.id);
			if (wasOpen !== isOpen) {
				setSectionExpanded(section.id, isOpen);
			}
		}
	};

	const visibleSections = sortedSections.filter(
		(section) => (sectionItems.get(section.id)?.length ?? 0) > 0,
	);

	return (
		<Accordion value={expandedIds} onValueChange={handleAccordionChange}>
			{visibleSections.map((section) => (
				<InsertSection
					key={section.id}
					id={section.id}
					titleKey={section.titleKey}
					viewMode={viewMode}
				>
					{(sectionItems.get(section.id) ?? []) as readonly ReactElement[]}
				</InsertSection>
			))}
		</Accordion>
	);
}
