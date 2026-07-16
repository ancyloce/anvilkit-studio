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
import {
	buildInsertSearchIndex,
	NO_MATCH,
	normalizeInsertQuery,
	rankInsertMatch,
} from "./insert-search-index";

interface DrawerItemElementProps {
	readonly name?: string;
	readonly children?: ReactNode;
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

	const drawerItems = useMemo(() => collectDrawerItems(children), [children]);

	// Normalized once per library shape — keystrokes never re-derive
	// presentations or re-lowercase anything (task §5.6).
	const searchIndex = useMemo(
		() =>
			buildInsertSearchIndex(
				drawerItems.flatMap((child) =>
					child.props.name === undefined ? [] : [child.props.name],
				),
				config as Parameters<typeof buildInsertSearchIndex>[1],
				categoryIndex,
			),
		[drawerItems, config, categoryIndex],
	);

	const query = normalizeInsertQuery(search);

	const { sectionItems, flatMatches, totalItems } = useMemo(() => {
		const items = new Map<string, ReactNode[]>();
		for (const section of sortedSections) items.set(section.id, []);
		const ranked: { child: ReactNode; rank: number }[] = [];
		let total = 0;

		for (const child of drawerItems) {
			const name = child.props.name;
			if (name === undefined) continue;
			total += 1;
			const category = categoryIndex.get(name);
			if (query.length > 0) {
				const record = searchIndex.get(name);
				const rank =
					record === undefined ? NO_MATCH : rankInsertMatch(record, query);
				if (rank === NO_MATCH) continue;
				ranked.push({ child, rank });
				continue;
			}
			for (const section of sortedSections) {
				if (section.predicate(name, { category })) {
					items.get(section.id)?.push(child);
					break;
				}
			}
		}

		// Stable rank sort: exact/prefix title hits first, library order
		// breaks ties (Array.prototype.sort is stable).
		ranked.sort((a, b) => a.rank - b.rank);

		return {
			sectionItems: items,
			flatMatches: ranked.map((entry) => entry.child),
			totalItems: total,
		};
	}, [drawerItems, query, sortedSections, categoryIndex, searchIndex]);

	// Empty-library state takes precedence — if Puck handed us no
	// Drawer.Items at all, neither sections nor search results matter.
	if (totalItems === 0) {
		return <InsertEmptyState variant="library" />;
	}

	if (query.length > 0) {
		if (flatMatches.length === 0) {
			return <InsertEmptyState variant="search" />;
		}
		const FlatTiles = viewMode === "grid" ? InsertTileGrid : InsertTileList;
		// FlatTiles windows internally past `Windowed`'s threshold, so a
		// large flat search stays DOM-bounded without a bespoke viewport
		// here; small result sets keep their exact prior markup.
		return <FlatTiles>{flatMatches}</FlatTiles>;
	}

	const expandedIds = sortedSections.flatMap((section) =>
		expanded[section.id] !== false ? [section.id] : [],
	);

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
