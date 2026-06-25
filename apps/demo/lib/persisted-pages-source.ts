/**
 * @file Durable `StudioPagesSource` backed by the demo's `/api/pages/*` routes.
 *
 * The in-memory `createDemoPagesSource` (demo-pages-source.ts) is a fixture: its
 * create/rename/delete edits never leave the editor tab, so the render routes
 * can't see them. This source is the production-shaped replacement — every
 * mutation writes through the durable {@link PageStorageAdapter} (via the API),
 * then re-lists, so a page configured in `/puck/editor` becomes resolvable at
 * `/puck/render/<slug>` and `/<slug>`.
 *
 * `list()` stays synchronous by serving an in-memory snapshot (so it remains a
 * drop-in for the editor's synchronous read); `refresh()` reconciles that
 * snapshot against the server after each write and notifies subscribers.
 *
 * Integration note: swapping this in for `createDemoPagesSource` also requires
 * `onSelect` to load the selected page's document from the store (the editor's
 * `pageDataMapRef` only holds documents authored in the current session). That
 * editor-side wiring is intentionally left to the host; this module owns only
 * the page-list <-> storage contract.
 */
import { studioPageSeoToPageRootSeo } from "@anvilkit/core";
import type {
	StudioPage,
	StudioPageCreateInput,
	StudioPageRenameInput,
	StudioPageSettingsInput,
	StudioPagesSource,
} from "@anvilkit/core/types";
import type { PageRootProps } from "@anvilkit/schema";
import type { ApiResponse } from "./page-storage/response";
import type {
	DemoPageData,
	PageRecord,
	PageSummary,
} from "./page-storage/types";
import { createDemoData } from "./puck-demo";

const JSON_HEADERS = { "content-type": "application/json" } as const;

const pathToSlug = (path: string): string =>
	path.replace(/^\/+/, "").replace(/\/+$/, "");

const slugToPath = (slug: string): string => `/${slug}`;

/** Read a Page API response, returning `data` on success and `null` on failure. */
async function readApi<T>(
	input: string,
	init?: RequestInit,
): Promise<T | null> {
	try {
		const res = await fetch(input, init);
		const body = (await res.json()) as ApiResponse<T>;
		return body.ok ? body.data : null;
	} catch {
		return null;
	}
}

/** Project a storage summary onto the sidebar's `StudioPage` row. */
function summaryToStudioPage(
	summary: PageSummary,
	activeId: string,
): StudioPage {
	return {
		id: summary.id,
		title: summary.title,
		...(summary.slug.length > 0
			? { path: slugToPath(summary.slug), route: true }
			: {}),
		active: summary.id === activeId,
	};
}

/** Seed a fresh draft document carrying the new page's title + slug. */
function draftDocFor(title: string, slug: string): DemoPageData {
	const base = createDemoData();
	const props = base.root.props as PageRootProps;
	return {
		...base,
		root: { ...base.root, props: { ...props, title, slug, status: "draft" } },
	};
}

export interface PersistedPagesSource extends StudioPagesSource {
	/** Manually set the active page id from outside the source. */
	setActivePageId(id: string): void;
	/** Re-list from the server and notify subscribers. */
	refresh(): Promise<void>;
}

export function createPersistedPagesSource(
	options: { readonly initial?: readonly StudioPage[] } = {},
): PersistedPagesSource {
	let snapshot: readonly StudioPage[] = options.initial ?? [];
	let activeId: string = snapshot[0]?.id ?? "";
	const listeners = new Set<() => void>();

	const notify = (): void => {
		for (const listener of listeners) listener();
	};

	/**
	 * Fetch the full `root.props` of a record (settings PATCH validates the
	 * whole object), merge a partial patch over it, and write it back. Returns
	 * the merged props so callers can avoid a second read.
	 */
	const patchSettings = async (
		id: string,
		patch: Partial<PageRootProps>,
	): Promise<void> => {
		const record = await readApi<PageRecord>(
			`/api/pages/${encodeURIComponent(id)}`,
		);
		const base = record?.draft?.root.props ?? record?.published?.root.props;
		const mappedSeo = patch.seo;
		const merged: PageRootProps = {
			title: patch.title ?? base?.title ?? record?.title ?? "Untitled",
			slug: patch.slug ?? base?.slug ?? record?.slug ?? "",
			status: base?.status ?? "draft",
			version: base?.version ?? "1.0.0",
			parentFolder: base?.parentFolder ?? "/",
			seo: {
				...(base?.seo ?? {}),
				...(mappedSeo ?? {}),
				noIndex: mappedSeo?.noIndex ?? base?.seo?.noIndex ?? false,
			},
		};
		await readApi<PageRecord>(`/api/pages/${encodeURIComponent(id)}/settings`, {
			method: "PATCH",
			headers: JSON_HEADERS,
			body: JSON.stringify(merged),
		});
	};

	const refresh = async (): Promise<void> => {
		const records = await readApi<PageSummary[]>("/api/pages");
		if (records === null) return;
		if (!records.some((record) => record.id === activeId)) {
			activeId = records[0]?.id ?? "";
		}
		snapshot = records.map((record) => summaryToStudioPage(record, activeId));
		notify();
	};

	return {
		list(): readonly StudioPage[] {
			return snapshot;
		},
		subscribe(listener: () => void): () => void {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		onSelect(pageId: string): void {
			if (!snapshot.some((page) => page.id === pageId)) return;
			activeId = pageId;
			snapshot = snapshot.map((page) => ({
				...page,
				active: page.id === pageId,
			}));
			notify();
		},
		onCreate(input: StudioPageCreateInput): void {
			const slug = pathToSlug(input.path.length > 0 ? input.path : input.title);
			void readApi<PageRecord>("/api/pages/draft", {
				method: "POST",
				headers: JSON_HEADERS,
				body: JSON.stringify({
					slug,
					title: input.title,
					data: draftDocFor(input.title, slug),
				}),
			}).then(() => refresh());
		},
		onRename(input: StudioPageRenameInput): void {
			void patchSettings(input.id, {
				title: input.title,
				...(input.path !== undefined ? { slug: pathToSlug(input.path) } : {}),
			}).then(() => refresh());
		},
		onDelete(pageId: string): void {
			void readApi<null>(`/api/pages/${encodeURIComponent(pageId)}`, {
				method: "DELETE",
			}).then(() => refresh());
		},
		onDuplicate(pageId: string): void {
			void readApi<PageRecord>(
				`/api/pages/${encodeURIComponent(pageId)}/duplicate`,
				{ method: "POST", headers: JSON_HEADERS, body: "{}" },
			).then(() => refresh());
		},
		onUpdateSettings(input: StudioPageSettingsInput): void {
			const patch: Partial<PageRootProps> = {};
			if (input.title !== undefined) patch.title = input.title;
			if (input.path !== undefined) patch.slug = pathToSlug(input.path);
			if (input.seo !== undefined) {
				const mappedSeo = studioPageSeoToPageRootSeo(input.seo);
				patch.seo = { ...mappedSeo, noIndex: mappedSeo.noIndex ?? false };
			}
			void patchSettings(input.id, patch).then(() => refresh());
		},
		setActivePageId(id: string): void {
			activeId = id;
			notify();
		},
		refresh,
	};
}
