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

import {
	pageRootToStudioPageFields,
	studioPageSeoToPageRootSeo,
} from "@anvilkit/core";
import type {
	StudioPage,
	StudioPageCreateInput,
	StudioPageRenameInput,
	StudioPageReorderInput,
	StudioPageSettingsInput,
	StudioPagesSource,
} from "@anvilkit/core/types";
import type { PageRootProps } from "@anvilkit/schema";

/**
 * Read/write access to a page's canonical Puck `root.props` (PRD 0004 F4).
 * The pages-source derives `title`/`seo` from `root.props` instead of holding
 * a parallel copy, and writes settings/rename edits back into it so the rail,
 * breadcrumb, and renderer read one source. Optional so callers that don't
 * provide page data fall back to the seed `title` and carry no SEO.
 */
export interface DemoPageRootAccessor {
	getRootProps(id: string): PageRootProps | undefined;
	updateRootProps(id: string, patch: Partial<PageRootProps>): void;
}

interface MutablePage {
	id: string;
	/**
	 * Fallback title used only when a page has no `root.props` yet (e.g. a
	 * runtime-created/duplicated page before it is activated). The canonical
	 * title lives in `root.props.title` and is derived in `snapshot()`.
	 */
	title: string;
	path?: string;
	route?: boolean;
	description?: string;
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

export function createDemoPagesSource(
	accessor?: DemoPageRootAccessor,
): DemoPagesSource {
	const pages: MutablePage[] = SEED_PAGES.map((page) => ({ ...page }));
	let activeId: string = pages[0]?.id ?? "";
	const listeners = new Set<() => void>();

	const notify = (): void => {
		for (const listener of listeners) listener();
	};

	const snapshot = (): readonly StudioPage[] =>
		pages.map((page) => {
			// `title`/`seo` are canonical in the page's Puck `root.props`;
			// derive them via the core helper. Fall back to the seed `title`
			// for pages that have no `root.props` yet (runtime-created rows).
			const derived = pageRootToStudioPageFields(
				accessor?.getRootProps(page.id),
			);
			return {
				id: page.id,
				title: derived.title ?? page.title,
				...(page.path !== undefined ? { path: page.path } : {}),
				...(page.route !== undefined ? { route: page.route } : {}),
				...(page.description !== undefined
					? { description: page.description }
					: {}),
				...(derived.seo !== undefined ? { seo: derived.seo } : {}),
				...(page.locked === true ? { locked: true } : {}),
				active: page.id === activeId,
			};
		});

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
			// Keep the sidecar fallback in sync, but write the canonical title
			// into `root.props` so the derived label and renderer agree.
			page.title = input.title;
			if (input.path !== undefined) page.path = input.path;
			accessor?.updateRootProps(input.id, { title: input.title });
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
			// Routing + description metadata stays in the sidecar.
			if (input.path !== undefined) page.path = input.path;
			if (input.route !== undefined) page.route = input.route;
			if (input.description !== undefined) page.description = input.description;
			// `title` + `seo` are canonical in `root.props` — write them there
			// (no parallel SEO copy persists in the source). The reverse mapper
			// renames `StudioPageSeo` fields back to the schema's `seo` shape;
			// merge over the existing `seo` to preserve `canonical`/`noIndex`.
			const patch: Partial<PageRootProps> = {};
			if (input.title !== undefined) {
				patch.title = input.title;
				page.title = input.title;
			}
			if (input.seo !== undefined) {
				const current = accessor?.getRootProps(input.id)?.seo;
				const mapped = studioPageSeoToPageRootSeo(input.seo);
				patch.seo = {
					...(current ?? {}),
					...mapped,
					noIndex: mapped.noIndex ?? current?.noIndex ?? false,
				};
			}
			if (
				accessor !== undefined &&
				(patch.title !== undefined || patch.seo !== undefined)
			) {
				accessor.updateRootProps(input.id, patch);
			}
			notify();
		},
		setActivePageId(id: string): void {
			activeId = id;
			notify();
		},
	};
}
