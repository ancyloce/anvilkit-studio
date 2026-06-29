import { PageRootSchema } from "@anvilkit/schema";
import {
	type ValidationIssue,
	validatePageRootProps,
	validatePublishRequest,
	validateSaveDraftRequest,
} from "@anvilkit/validator";
import { recordServerPagePublished } from "../analytics/server-events";
import {
	API_ERROR,
	type ApiResponse,
	apiFailure,
	apiSuccess,
} from "./response";
import {
	type DemoPageData,
	type PageRecord,
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
	};
	const slug = input.slug ?? input.data.root?.props?.slug ?? "";
	const record = await storage.saveDraft({
		id: input.id,
		slug,
		title: input.title,
		data: input.data,
	});
	return { status: 200, body: apiSuccess(record) };
}

export async function publish(
	storage: PageStorageAdapter,
	body: unknown,
): Promise<HandlerResult<PageRecord>> {
	const result = validatePublishRequest(body);
	if (!result.valid) return validationFailure(result.issues);

	const input = body as { id?: string; slug?: string; data: DemoPageData };
	const record = await storage.publish({
		id: input.id,
		slug: input.slug,
		data: input.data,
	});
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
	return { status: 200, body: apiSuccess(record) };
}

export async function updateSettings(
	storage: PageStorageAdapter,
	id: string,
	body: unknown,
): Promise<HandlerResult<PageRecord>> {
	const result = validatePageRootProps(body);
	if (!result.valid) return validationFailure(result.issues);

	// Already validated — `parse` only normalizes defaults (parentFolder, seo).
	const rootProps = PageRootSchema.parse(body);
	const record = await storage.updateSettings(id, rootProps);
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

export async function deletePage(
	storage: PageStorageAdapter,
	id: string,
): Promise<HandlerResult<null>> {
	const existing = await storage.getById(id);
	if (existing === null) {
		return notFound(`No page found for id "${id}".`);
	}
	await storage.delete(id);
	return { status: 200, body: apiSuccess(null) };
}
