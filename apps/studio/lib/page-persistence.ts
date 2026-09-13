import type { PageRootProps } from "@anvilkit/schema";
import { validatePagePayload } from "@anvilkit/validator";
import type { Data } from "@puckeditor/core";
import type { ApiResponse } from "./page-storage/response";
import { type PageRecord, pageRevisionOf } from "./page-storage/types";
import type { DemoComponents } from "./puck-demo";

export type PersistKind = "draft" | "publish" | "preview";

/** The server refused the write because the stored page moved on (HTTP 409). */
export interface PageRevisionConflict {
	readonly expectedPageRevision: number;
	readonly currentPageRevision: number;
}

export interface PersistResult {
	readonly ok: boolean;
	/** The first validation issue / server message when `ok === false`. */
	readonly issue?: string;
	/**
	 * The record's `pageRevision` after a successful draft save or publish —
	 * what the next write of this page must present. Absent for previews (the
	 * scratch slot) and when the server reported none.
	 */
	readonly pageRevision?: number;
	/**
	 * Set when the server answered `E_PAGE_REVISION_CONFLICT`: nothing was
	 * written, the editor's edits are untouched, and the page has to be
	 * reopened at `currentPageRevision` before it can be saved again. Never
	 * retried or merged here.
	 */
	readonly conflict?: PageRevisionConflict;
}

export interface PersistOptions {
	/**
	 * The record the editor opened (its page id). Sent so the write targets
	 * exactly the record whose revision was read, not whichever record the
	 * slug resolves to.
	 */
	readonly id?: string;
	/**
	 * The `pageRevision` read when the page was opened (0 for a page with no
	 * record yet). Sent as `expectedPageRevision`, so the server commits the
	 * write only if the record still carries it (S1-T04).
	 */
	readonly expectedPageRevision?: number;
}

/**
 * What the editor finds when it opens a page through `GET /api/pages/:id`:
 * the stored record (its draft/published document and its `pageRevision`),
 * `absent` when no record exists yet, or `unavailable` when the read failed —
 * the editor then has no revision to present and must not save blind.
 */
export type StoredPage =
	| { readonly status: "found"; readonly record: PageRecord }
	| { readonly status: "absent" }
	| { readonly status: "unavailable" };

export async function readStoredPage(id: string): Promise<StoredPage> {
	try {
		const res = await fetch(`/api/pages/${encodeURIComponent(id)}`);
		if (res.status === 404) return { status: "absent" };
		if (!res.ok) return { status: "unavailable" };
		const body = (await res.json()) as ApiResponse<PageRecord>;
		return body.ok
			? { status: "found", record: body.data }
			: { status: "unavailable" };
	} catch {
		return { status: "unavailable" };
	}
}

/**
 * The revision a page opened as {@link StoredPage} must present on its next
 * write: the record's `pageRevision` (0 for a legacy record without one), 0
 * for a page with no record yet, `null` when the read failed.
 */
export function storedPageRevision(page: StoredPage): number | null {
	switch (page.status) {
		case "found":
			return pageRevisionOf(page.record);
		case "absent":
			return 0;
		default:
			return null;
	}
}

interface ConflictIssue {
	readonly code?: unknown;
	readonly expectedPageRevision?: unknown;
	readonly currentPageRevision?: unknown;
}

function readConflict(
	body: ApiResponse<unknown> | null,
): PageRevisionConflict | undefined {
	if (body === null || body.ok !== false) return undefined;
	const issue = (body.issues ?? []).find(
		(candidate): candidate is ConflictIssue =>
			typeof candidate === "object" &&
			candidate !== null &&
			(candidate as ConflictIssue).code === "E_PAGE_REVISION_CONFLICT",
	);
	if (
		issue === undefined ||
		typeof issue.expectedPageRevision !== "number" ||
		typeof issue.currentPageRevision !== "number"
	) {
		return undefined;
	}
	return {
		expectedPageRevision: issue.expectedPageRevision,
		currentPageRevision: issue.currentPageRevision,
	};
}

/**
 * F7 save/publish gateway: validate the page payload, then persist it through
 * the durable Page API (`POST /api/pages/<kind>` → {@link getPageStorage},
 * SQLite by default). Returns `{ ok:false, issue }` for an invalid payload or a
 * rejected/failed write — the caller surfaces the issue and aborts (nothing is
 * served). The legacy `localStorage` MVP and the `NEXT_PUBLIC_USE_REMOTE_STORAGE`
 * gate are gone: every save/publish is durable.
 *
 * Draft saves and publishes carry the record id and the `expectedPageRevision`
 * the editor read when it opened the page ({@link readStoredPage}), so a
 * concurrent writer's revision is refused by the server as a 409 that comes
 * back as {@link PersistResult.conflict}; a successful write returns the new
 * {@link PersistResult.pageRevision}. `schemaRevision` plays no part in this.
 *
 * `kind: "preview"` is the one exception to the validation gate and to the
 * revision check. It targets the `__preview__` scratch slot
 * (`POST /api/pages/preview`), which bypasses the canonical `PageRootSchema`
 * *by design*: a preview renders the LIVE document, which is routinely
 * mid-authoring (a Slug root field typed but not yet slugified, a cleared
 * Title). Validating it here would reject exactly the in-progress documents
 * preview exists to show. The scratch route ignores the `slug` in the body, so
 * the shared request shape is kept.
 */
export async function persistPage(
	kind: PersistKind,
	data: Data<DemoComponents, PageRootProps>,
	options: PersistOptions = {},
): Promise<PersistResult> {
	const rootProps = data.root.props as PageRootProps | undefined;
	if (kind !== "preview") {
		const result = validatePagePayload(rootProps);
		if (!result.valid) {
			return {
				ok: false,
				issue: result.issues[0]?.message ?? "Invalid page payload",
			};
		}
	}

	const slug = rootProps?.slug ?? "";
	const body: Record<string, unknown> = { slug, data };
	if (kind !== "preview") {
		if (options.id !== undefined) body.id = options.id;
		if (options.expectedPageRevision !== undefined) {
			body.expectedPageRevision = options.expectedPageRevision;
		}
	}
	try {
		const res = await fetch(`/api/pages/${kind}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		const payload = (await res
			.json()
			.catch(() => null)) as ApiResponse<PageRecord | null> | null;
		if (!res.ok) {
			const issue =
				payload !== null && payload.ok === false
					? payload.message
					: `Persist failed (${res.status})`;
			const conflict = res.status === 409 ? readConflict(payload) : undefined;
			return conflict === undefined
				? { ok: false, issue }
				: { ok: false, issue, conflict };
		}
		if (kind !== "preview" && payload !== null && payload.ok) {
			const pageRevision = payload.data?.pageRevision;
			if (typeof pageRevision === "number") {
				return { ok: true, pageRevision };
			}
		}
	} catch (error) {
		return {
			ok: false,
			issue: error instanceof Error ? error.message : "Persist request failed",
		};
	}
	return { ok: true };
}
