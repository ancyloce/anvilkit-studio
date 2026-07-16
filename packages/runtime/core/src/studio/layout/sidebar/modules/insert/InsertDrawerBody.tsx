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

import type { Config as PuckConfig } from "@puckeditor/core";
import { useGetPuck } from "@puckeditor/core";
import {
	Children,
	isValidElement,
	type ReactElement,
	type ReactNode,
	useMemo,
} from "react";
import {
	matchesPresentationQuery,
	readComponentPresentation,
} from "@/overrides/utils/component-presentation";
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

interface DrawerItemElementProps {
	readonly name?: string;
	readonly children?: ReactNode;
}

/**
 * task Phase 9: matches name (as before), plus the friendly title,
 * description, and keywords a component optionally provides via
 * `readComponentPresentation` (Puck's own `label`/`metadata`), plus
 * the component's declared Puck category — "search should match
 * name, keywords, description, category."
 */
function matchesInsertQuery(
	name: string,
	category: string | undefined,
	config: PuckConfig | undefined,
	query: string,
): boolean {
	if (query.length === 0) return true;
	if (
		category !== undefined &&
		category.toLowerCase().includes(query.toLowerCase())
	) {
		return true;
	}
	const componentConfig = config?.components?.[name] as
		| { label?: string; metadata?: unknown }
		| undefined;
	const presentation = readComponentPresentation(componentConfig, name);
	return matchesPresentationQuery(presentation, name, query);
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
			const category = categoryIndex.get(name);
			if (search.length > 0) {
				if (!matchesInsertQuery(name, category, config, search)) continue;
				flat.push(child);
				continue;
			}
			for (const section of sortedSections) {
				if (section.predicate(name, { category })) {
					items.get(section.id)?.push(child);
					break;
				}
			}
		}

		return { sectionItems: items, flatMatches: flat, totalItems: total };
	}, [children, search, sortedSections, categoryIndex, config]);

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
