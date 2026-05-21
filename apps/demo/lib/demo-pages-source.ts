/**
 * @file Demo `StudioPagesSource` fixture.
 *
 * In-memory page list mirroring the seed catalogue from PRD §6.2.
 * Wires `<Studio pages={...}>` so the layer module is exercisable
 * end-to-end in the demo (no real router or persistence). All five
 * mutation callbacks land in plan 0004 P6 so the affordances inside
 * `PageRow` actually do something — capability gating is verified
 * because the menu items only render once a callback is implemented.
 */

import type {
	StudioPage,
	StudioPageCreateInput,
	StudioPageRenameInput,
	StudioPageReorderInput,
	StudioPageSeo,
	StudioPageSettingsInput,
	StudioPagesSource,
} from "@anvilkit/core/types";

interface MutablePage {
	id: string;
	title: string;
	path?: string;
	route?: boolean;
	description?: string;
	seo?: StudioPageSeo;
	locked?: boolean;
}

const SEED_PAGES: readonly MutablePage[] = [
	// `locked: true` suppresses Rename + Delete in `PageRow` and now also
	// selects the Home icon (PRD §6 risk-6 follow-through — the legacy
	// `id === "home"` heuristic was removed from core in P6).
	{ id: "home", title: "Home", locked: true },
	{ id: "list", title: "/list", path: "/list", route: true },
	{ id: "team", title: "/team", path: "/team", route: true },
	{ id: "about", title: "About" },
	{ id: "profile", title: "/profile", path: "/profile", route: true },
	{ id: "items", title: "/items", path: "/items", route: true },
	{ id: "product", title: "/product", path: "/product", route: true },
];

export interface DemoPagesSource extends StudioPagesSource {
	/** Manually set the active page id from outside the source. */
	setActivePageId(id: string): void;
}

export function createDemoPagesSource(): DemoPagesSource {
	const pages: MutablePage[] = SEED_PAGES.map((page) => ({ ...page }));
	let activeId: string = pages[0]?.id ?? "";
	const listeners = new Set<() => void>();

	const notify = (): void => {
		for (const listener of listeners) listener();
	};

	const snapshot = (): readonly StudioPage[] =>
		pages.map((page) => ({
			id: page.id,
			title: page.title,
			...(page.path !== undefined ? { path: page.path } : {}),
			...(page.route !== undefined ? { route: page.route } : {}),
			...(page.description !== undefined
				? { description: page.description }
				: {}),
			...(page.seo !== undefined ? { seo: page.seo } : {}),
			...(page.locked === true ? { locked: true } : {}),
			active: page.id === activeId,
		}));

	const requirePage = (id: string): MutablePage => {
		const found = pages.find((page) => page.id === id);
		if (found === undefined) throw new Error(`Page not found: ${id}`);
		return found;
	};

	return {
		list(): readonly StudioPage[] {
			return snapshot();
		},
		subscribe(listener: () => void): () => void {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		onSelect(pageId: string): void {
			if (!pages.some((page) => page.id === pageId)) return;
			activeId = pageId;
			notify();
		},
		onCreate(input: StudioPageCreateInput): void {
			const id = `page-${Date.now()}`;
			const next: MutablePage = {
				id,
				title: input.title,
				...(input.path.length > 0 ? { path: input.path } : {}),
				...(input.route === true ? { route: true } : {}),
			};
			pages.push(next);
			activeId = id;
			notify();
		},
		onRename(input: StudioPageRenameInput): void {
			const page = requirePage(input.id);
			page.title = input.title;
			if (input.path !== undefined) page.path = input.path;
			notify();
		},
		onDelete(pageId: string): void {
			const index = pages.findIndex((page) => page.id === pageId);
			if (index < 0) throw new Error(`Page not found: ${pageId}`);
			pages.splice(index, 1);
			if (activeId === pageId) {
				// Prefer the next sibling, fall back to the previous, then to "".
				activeId = pages[index]?.id ?? pages[index - 1]?.id ?? "";
			}
			notify();
		},
		async onDuplicate(pageId: string): Promise<StudioPage> {
			const source = requirePage(pageId);
			const id = `${pageId}-copy-${Date.now()}`;
			const copy: MutablePage = {
				id,
				title: `${source.title} (copy)`,
				...(source.path !== undefined ? { path: `${source.path}-copy` } : {}),
				...(source.route !== undefined ? { route: source.route } : {}),
				...(source.description !== undefined
					? { description: source.description }
					: {}),
			};
			pages.push(copy);
			notify();
			// PRD §3.3 / §5 — sole exception to "no optimistic mutation":
			// return the created page so `PageRow` can pre-select it before
			// the subscribe round-trip lands.
			return {
				id: copy.id,
				title: copy.title,
				...(copy.path !== undefined ? { path: copy.path } : {}),
				...(copy.route !== undefined ? { route: copy.route } : {}),
			};
		},
		onReorder(input: StudioPageReorderInput): void {
			const fromIndex = pages.findIndex((page) => page.id === input.id);
			if (fromIndex < 0) throw new Error(`Page not found: ${input.id}`);
			const clampedTo = Math.max(0, Math.min(input.toIndex, pages.length - 1));
			if (fromIndex === clampedTo) return;
			const [moved] = pages.splice(fromIndex, 1);
			if (moved !== undefined) pages.splice(clampedTo, 0, moved);
			notify();
		},
		onUpdateSettings(input: StudioPageSettingsInput): void {
			const page = requirePage(input.id);
			if (input.title !== undefined) page.title = input.title;
			if (input.path !== undefined) page.path = input.path;
			if (input.route !== undefined) page.route = input.route;
			if (input.description !== undefined) page.description = input.description;
			if (input.seo !== undefined) page.seo = input.seo;
			notify();
		},
		setActivePageId(id: string): void {
			activeId = id;
			notify();
		},
	};
}
