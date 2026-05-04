/**
 * @file Demo `StudioPagesSource` fixture.
 *
 * In-memory page list mirroring the seed catalogue from PRD §6.2.
 * Wires `<Studio pages={...}>` so the layer module is exercisable
 * end-to-end in the demo (no real router or persistence).
 */

import type {
	StudioPage,
	StudioPageCreateInput,
	StudioPagesSource,
} from "@anvilkit/core/types";

interface MutablePage {
	id: string;
	title: string;
	path?: string;
	route?: boolean;
}

const SEED_PAGES: readonly MutablePage[] = [
	{ id: "home", title: "Home" },
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
			active: page.id === activeId,
		}));

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
		setActivePageId(id: string): void {
			activeId = id;
			notify();
		},
	};
}
