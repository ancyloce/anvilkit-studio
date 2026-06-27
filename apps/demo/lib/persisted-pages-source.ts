/**
 * @file Durable `StudioPagesSource` for `/puck/editor`, backed by the demo's
 * `/api/pages/*` routes (→ {@link getPageStorage}, SQLite by default).
 *
 * This is a **drop-in replacement** for `createDemoPagesSource`
 * (lib/demo-pages-source.ts): it keeps the exact same client-side snapshot
 * semantics — deterministic seed ids (`home`, `about`, …), `locked` Home,
 * keyboard reorder, and the optimistic-duplicate pre-select — so the page rail
 * (and the `pages-management` E2E contract that keys on `ak-layer-page-row-<id>`)
 * behaves identically. The difference is that every mutation is *also* written
 * through to the durable store via the Page API, so a page created / renamed /
 * deleted / republished in the editor is resolvable at `/puck/render/<slug>` and
 * the public `/<slug>` route.
 *
 * The write-through calls are fire-and-forget (errors are swallowed, never
 * thrown into React render): the rail updates synchronously from the local
 * snapshot, and the server reconciles in the background. The store is seeded
 * (lib/page-store.ts `seedIfEmpty`) with these same stable ids, so settings /
 * rename / delete PATCH/DELETE by id land on the matching record.
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
import type { DemoPageRootAccessor } from "./demo-pages-source";
import type { DemoPageData } from "./page-storage/types";
import { createDemoData } from "./puck-demo";

const JSON_HEADERS = { "content-type": "application/json" } as const;

interface MutablePage {
	id: string;
	title: string;
	path?: string;
	route?: boolean;
	description?: string;
	locked?: boolean;
}

const SEED_PAGES: readonly MutablePage[] = [
	{ id: "home", title: "Home", locked: true },
	{ id: "list", title: "/list", path: "/list", route: true },
	{ id: "team", title: "/team", path: "/team", route: true },
	{ id: "about", title: "About" },
	{ id: "profile", title: "/profile", path: "/profile", route: true },
	{ id: "items", title: "/items", path: "/items", route: true },
	{ id: "product", title: "/product", path: "/product", route: true },
];

export interface PersistedPagesSource extends StudioPagesSource {
	/** Manually set the active page id from outside the source. */
	setActivePageId(id: string): void;
}

const pathToSlug = (path: string): string =>
	path.replace(/^\/+/, "").replace(/\/+$/, "");

/** Fire-and-forget Page API write — never rejects into React render. */
async function writeThrough(input: string, init: RequestInit): Promise<void> {
	try {
		await fetch(input, init);
	} catch {
		// Background reconciliation only; the rail already reflects the change.
	}
}

/** Seed a fresh published document carrying the new page's title + slug. */
function docFor(title: string, slug: string): DemoPageData {
	const base = createDemoData();
	const props = base.root.props as PageRootProps;
	return {
		...base,
		root: {
			...base.root,
			props: { ...props, title, slug, status: "published" },
		},
	};
}

/** Build a complete, schema-valid `PageRootProps` for a settings PATCH. */
function mergedRootProps(
	current: PageRootProps | undefined,
	patch: Partial<PageRootProps>,
	fallback: { title: string; slug: string },
): PageRootProps {
	return {
		title: patch.title ?? current?.title ?? fallback.title,
		slug: patch.slug ?? current?.slug ?? fallback.slug,
		status: patch.status ?? current?.status ?? "published",
		version: current?.version ?? "1.0.0",
		parentFolder: current?.parentFolder ?? "/",
		seo: {
			...(current?.seo ?? {}),
			...(patch.seo ?? {}),
			noIndex: patch.seo?.noIndex ?? current?.seo?.noIndex ?? false,
		},
	};
}

export function createPersistedPagesSource(
	accessor?: DemoPageRootAccessor,
): PersistedPagesSource {
	const pages: MutablePage[] = SEED_PAGES.map((page) => ({ ...page }));
	let activeId: string = pages[0]?.id ?? "";
	const listeners = new Set<() => void>();

	const notify = (): void => {
		for (const listener of listeners) listener();
	};

	const snapshot = (): readonly StudioPage[] =>
		pages.map((page) => {
			// `title`/`seo` are canonical in the page's Puck `root.props`; derive
			// them via the core helper, falling back to the seed `title`.
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

	const slugFor = (page: MutablePage): string =>
		accessor?.getRootProps(page.id)?.slug ??
		(page.path !== undefined ? pathToSlug(page.path) : page.id);

	/** Push the page's current `root.props` (merged with `patch`) to storage. */
	const patchSettingsThrough = (
		id: string,
		patch: Partial<PageRootProps>,
		fallback: { title: string; slug: string },
	): void => {
		const merged = mergedRootProps(accessor?.getRootProps(id), patch, fallback);
		void writeThrough(`/api/pages/${encodeURIComponent(id)}/settings`, {
			method: "PATCH",
			headers: JSON_HEADERS,
			body: JSON.stringify(merged),
		});
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
			const slug = pathToSlug(input.path.length > 0 ? input.path : input.title);
			const next: MutablePage = {
				id,
				title: input.title,
				...(input.path.length > 0 ? { path: input.path } : {}),
				...(input.route === true ? { route: true } : {}),
			};
			pages.push(next);
			activeId = id;
			notify();
			// Persist as a published document under the same id so `/render/<slug>`
			// resolves it immediately.
			void writeThrough("/api/pages/publish", {
				method: "POST",
				headers: JSON_HEADERS,
				body: JSON.stringify({ id, slug, data: docFor(input.title, slug) }),
			});
		},
		onRename(input: StudioPageRenameInput): void {
			const page = requirePage(input.id);
			page.title = input.title;
			if (input.path !== undefined) page.path = input.path;
			// Canonical title lives in `root.props`; mirror it so the derived label
			// and renderer agree, then persist the settings change.
			accessor?.updateRootProps(input.id, { title: input.title });
			patchSettingsThrough(
				input.id,
				{
					title: input.title,
					...(input.path !== undefined ? { slug: pathToSlug(input.path) } : {}),
				},
				{ title: input.title, slug: slugFor(page) },
			);
			notify();
		},
		onDelete(pageId: string): void {
			const index = pages.findIndex((page) => page.id === pageId);
			if (index < 0) throw new Error(`Page not found: ${pageId}`);
			pages.splice(index, 1);
			if (activeId === pageId) {
				activeId = pages[index]?.id ?? pages[index - 1]?.id ?? "";
			}
			notify();
			void writeThrough(`/api/pages/${encodeURIComponent(pageId)}`, {
				method: "DELETE",
			});
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
			// Persist the copy under the optimistic id (keeps the rail id and the
			// stored record id aligned, unlike the server-minted `/duplicate` id).
			const copySlug = `${slugFor(source)}-copy`;
			void writeThrough("/api/pages/publish", {
				method: "POST",
				headers: JSON_HEADERS,
				body: JSON.stringify({
					id,
					slug: copySlug,
					data: docFor(copy.title, copySlug),
				}),
			});
			// PRD §3.3 — optimistic pre-select: return the created page so `PageRow`
			// selects it before the subscribe round-trip.
			return {
				id: copy.id,
				title: copy.title,
				...(copy.path !== undefined ? { path: copy.path } : {}),
				...(copy.route !== undefined ? { route: copy.route } : {}),
			};
		},
		onReorder(input: StudioPageReorderInput): void {
			// Order is a client-only concern (the store has no ordering column);
			// reorder the local snapshot so the rail reflects the drag.
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
			if (input.path !== undefined) page.path = input.path;
			if (input.route !== undefined) page.route = input.route;
			if (input.description !== undefined) page.description = input.description;
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
			if (patch.title !== undefined || patch.seo !== undefined) {
				patchSettingsThrough(input.id, patch, {
					title: page.title,
					slug: slugFor(page),
				});
			}
			notify();
		},
		setActivePageId(id: string): void {
			activeId = id;
			notify();
		},
	};
}
