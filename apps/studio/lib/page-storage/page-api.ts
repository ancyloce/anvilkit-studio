import { PageRootSchema } from "@anvilkit/schema";
import {
	type ValidationIssue,
	validatePageRootProps,
	validatePublishRequest,
	validateSaveDraftRequest,
} from "@anvilkit/validator";
import { recordServerPagePublished } from "../analytics/server-events";
import {
	REMOTE_COMPONENT_LOCK_KEY,
	readRemoteComponentLock,
} from "../host-abi/remote-component-lock";
import {
	API_ERROR,
	type ApiResponse,
	apiFailure,
	apiSuccess,
} from "./response";
import {
	type DemoPageData,
	type PageRecord,
	PageRevisionConflictError,
	type PageStatus,
	type PageStorageAdapter,
	type PageSummary,
	toSummary,
} from "./types";

/**
 * Pure, framework-agnostic Page API handlers. Each takes a
 * {@link PageStorageAdapter} and the parsed request input and returns an HTTP
 * status plus a consistent {@link ApiResponse} body. All request validation and
 * response shaping live here, so the Next route files stay trivial and these
 * handlers unit-test against a {@link MemoryPageStorageAdapter} without pulling
 * in Next or React.
 */
export interface HandlerResult<T> {
	readonly status: number;
	readonly body: ApiResponse<T>;
}

const STATUSES: readonly PageStatus[] = ["draft", "published", "archived"];

function notFound(message: string): HandlerResult<never> {
	return { status: 404, body: apiFailure(API_ERROR.notFound, message) };
}

function validationFailure(
	issues: readonly ValidationIssue[],
): HandlerResult<never> {
	const message = issues[0]?.message ?? "Invalid request payload.";
	return {
		status: 400,
		body: apiFailure(API_ERROR.validation, message, issues),
	};
}

/**
 * The page-revision and remote-lock checks a save or publish body passes
 * before it reaches storage (S1-T04). `expectedPageRevision`, when present,
 * must be a non-negative safe integer; a `root.props.remoteComponentLock`,
 * when present, must satisfy the host's schema mirror — a request can never
 * write a lock the host cannot read. Neither field is part of the shared
 * `@anvilkit/validator` request schemas, which are non-strict and validate a
 * stripped copy, so they are checked here against the raw body that storage
 * persists.
 */
function invalidExpectedRevision(): HandlerResult<never> {
	return validationFailure([
		{
			level: "error",
			code: "E_PAGE_INVALID_TYPE",
			message: "expectedPageRevision must be a non-negative integer.",
			path: ["expectedPageRevision"],
		},
	]);
}

function isPageRevision(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function checkWriteGuards(body: {
	expectedPageRevision?: unknown;
	data: DemoPageData;
}): HandlerResult<never> | null {
	const expected = body.expectedPageRevision;
	if (expected !== undefined && !isPageRevision(expected)) {
		return invalidExpectedRevision();
	}
	const lock = readRemoteComponentLock(body.data);
	if (lock.state === "unreadable") {
		return validationFailure([
			{
				level: "error",
				code: "E_PAGE_REMOTE_LOCK_INVALID",
				message: `remoteComponentLock is not a valid RemoteComponentLockV1: ${lock.reason}.`,
				path: ["data", "root", "props", REMOTE_COMPONENT_LOCK_KEY],
			},
		]);
	}
	return null;
}

/** A stale `expectedPageRevision` is a recoverable 409 carrying the current revision. */
function revisionConflict(
	error: PageRevisionConflictError,
): HandlerResult<never> {
	return {
		status: 409,
		body: apiFailure(API_ERROR.conflict, error.message, [
			{
				level: "error",
				code: "E_PAGE_REVISION_CONFLICT",
				message: error.message,
				path: ["expectedPageRevision"],
				expectedPageRevision: error.expectedPageRevision,
				currentPageRevision: error.currentPageRevision,
			},
		]),
	};
}

/**
 * The warnings a completed write reports: a stored lock this build cannot
 * read was preserved (the request's value was validated, so an unreadable
 * lock on the written record can only be a carried-over one).
 */
function writeWarnings(record: PageRecord): readonly unknown[] {
	const warnings: unknown[] = [];
	for (const [payload, data] of [
		["draft", record.draft],
		["published", record.published],
	] as const) {
		const lock = readRemoteComponentLock(data);
		if (lock.state === "unreadable") {
			warnings.push({
				level: "warning",
				code: "E_PAGE_REMOTE_LOCK_UNREADABLE",
				message: `The stored ${payload} remoteComponentLock could not be read (${lock.reason}); it was preserved unchanged, not replaced.`,
				path: [payload, "root", "props", REMOTE_COMPONENT_LOCK_KEY],
			});
		}
	}
	return warnings;
}

export async function listPages(
	storage: PageStorageAdapter,
	query: { status?: string; parentFolder?: string } = {},
): Promise<HandlerResult<PageSummary[]>> {
	const status = STATUSES.includes(query.status as PageStatus)
		? (query.status as PageStatus)
		: undefined;
	const records = await storage.list({
		status,
		parentFolder: query.parentFolder,
	});
	return { status: 200, body: apiSuccess(records.map(toSummary)) };
}

/** Resolve by id first, then slug — backs `GET /api/pages/:id|:slug`. */
export async function getPage(
	storage: PageStorageAdapter,
	idOrSlug: string,
): Promise<HandlerResult<PageRecord>> {
	const record =
		(await storage.getById(idOrSlug)) ?? (await storage.getBySlug(idOrSlug));
	if (record === null) {
		return notFound(`No page found for "${idOrSlug}".`);
	}
	return { status: 200, body: apiSuccess(record) };
}

export async function saveDraft(
	storage: PageStorageAdapter,
	body: unknown,
): Promise<HandlerResult<PageRecord>> {
	const result = validateSaveDraftRequest(body);
	if (!result.valid) return validationFailure(result.issues);

	const input = body as {
		id?: string;
		slug?: string;
		title?: string;
		data: DemoPageData;
		expectedPageRevision?: number;
	};
	const guard = checkWriteGuards(input);
	if (guard !== null) return guard;
	const slug = input.slug ?? input.data.root?.props?.slug ?? "";
	let record: PageRecord;
	try {
		record = await storage.saveDraft({
			id: input.id,
			slug,
			title: input.title,
			data: input.data,
			expectedPageRevision: input.expectedPageRevision,
		});
	} catch (error) {
		if (error instanceof PageRevisionConflictError) {
			return revisionConflict(error);
		}
		throw error;
	}
	return { status: 200, body: apiSuccess(record, writeWarnings(record)) };
}

export async function publish(
	storage: PageStorageAdapter,
	body: unknown,
): Promise<HandlerResult<PageRecord>> {
	const result = validatePublishRequest(body);
	if (!result.valid) return validationFailure(result.issues);

	const input = body as {
		id?: string;
		slug?: string;
		data: DemoPageData;
		expectedPageRevision?: number;
	};
	const guard = checkWriteGuards(input);
	if (guard !== null) return guard;
	let record: PageRecord;
	try {
		record = await storage.publish({
			id: input.id,
			slug: input.slug,
			data: input.data,
			expectedPageRevision: input.expectedPageRevision,
		});
	} catch (error) {
		if (error instanceof PageRevisionConflictError) {
			return revisionConflict(error);
		}
		throw error;
	}
	// Server-side fallback analytics/audit event (PRD 0004). Recorded ONLY
	// after a validated payload is durably written (200) — never on a
	// validation or storage failure (those return/throw before this line).
	// It is the factual counterpart to the client-side behavioral
	// `page_published`; `properties.server_side = true` distinguishes them. The
	// full document is never forwarded — only the primitive slug + record id.
	recordServerPagePublished({
		slug: record.slug,
		pageId: record.id,
		at: Date.now(),
	});
	return { status: 200, body: apiSuccess(record, writeWarnings(record)) };
}

/**
 * `PATCH /api/pages/:id/settings`: the body is the page's `root.props`, with an
 * optional `expectedPageRevision` beside them (the same claim a save or publish
 * makes); the non-strict root schema ignores the extra key and `parse` strips
 * it, so it never lands in the stored props. A stale claim is the same 409 as
 * on save and publish; a missing page is still 404.
 */
export async function updateSettings(
	storage: PageStorageAdapter,
	id: string,
	body: unknown,
): Promise<HandlerResult<PageRecord>> {
	const result = validatePageRootProps(body);
	if (!result.valid) return validationFailure(result.issues);
	const expected = (body as { expectedPageRevision?: unknown })
		.expectedPageRevision;
	if (expected !== undefined && !isPageRevision(expected)) {
		return invalidExpectedRevision();
	}

	// Already validated — `parse` only normalizes defaults (parentFolder, seo).
	const rootProps = PageRootSchema.parse(body);
	let record: PageRecord | null;
	try {
		record = await storage.updateSettings(id, rootProps, expected);
	} catch (error) {
		if (error instanceof PageRevisionConflictError) {
			return revisionConflict(error);
		}
		throw error;
	}
	if (record === null) {
		return notFound(`No page found for id "${id}".`);
	}
	return { status: 200, body: apiSuccess(record) };
}

export async function duplicatePage(
	storage: PageStorageAdapter,
	id: string,
	body?: { slug?: string; title?: string },
): Promise<HandlerResult<PageRecord>> {
	const source = await storage.getById(id);
	if (source === null) {
		return notFound(`No page found for id "${id}".`);
	}
	const desiredSlug = body?.slug ?? `${source.slug}-copy`;
	const clash = await storage.getBySlug(desiredSlug);
	if (clash !== null) {
		return {
			status: 409,
			body: apiFailure(
				API_ERROR.conflict,
				`A page with slug "${desiredSlug}" already exists.`,
			),
		};
	}
	const record = await storage.duplicate(id, body);
	if (record === null) {
		return notFound(`No page found for id "${id}".`);
	}
	return { status: 201, body: apiSuccess(record) };
}

export async function archivePage(
	storage: PageStorageAdapter,
	id: string,
): Promise<HandlerResult<PageRecord>> {
	const record = await storage.archive(id);
	if (record === null) {
		return notFound(`No page found for id "${id}".`);
	}
	return { status: 200, body: apiSuccess(record) };
}

/**
 * `DELETE /api/pages/:id`: `expectedPageRevision` (the route reads it from the
 * query string, a DELETE carrying no body) makes the delete conditional on the
 * revision the caller last read; a stale claim is a 409 and nothing is deleted.
 */
export async function deletePage(
	storage: PageStorageAdapter,
	id: string,
	expectedPageRevision?: unknown,
): Promise<HandlerResult<null>> {
	if (
		expectedPageRevision !== undefined &&
		!isPageRevision(expectedPageRevision)
	) {
		return invalidExpectedRevision();
	}
	const existing = await storage.getById(id);
	if (existing === null) {
		return notFound(`No page found for id "${id}".`);
	}
	try {
		await storage.delete(id, expectedPageRevision);
	} catch (error) {
		if (error instanceof PageRevisionConflictError) {
			return revisionConflict(error);
		}
		throw error;
	}
	return { status: 200, body: apiSuccess(null) };
}
