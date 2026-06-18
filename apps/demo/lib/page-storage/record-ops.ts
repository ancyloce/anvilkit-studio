import type { PageRootProps } from "@anvilkit/schema";
import type {
	DemoPageData,
	DuplicatePageInput,
	PageRecord,
	PublishPageInput,
	SaveDraftInput,
} from "./types";

/**
 * Pure record-mutation helpers shared by every {@link PageStorageAdapter}
 * implementation, so the memory and filesystem adapters can never diverge on
 * draft/publish/archive/version semantics. Each helper takes the current record
 * (or `null`) plus a clock/id context and returns the *next* record; the adapter
 * only owns persistence.
 */
export interface RecordOpsContext {
	nowIso(): string;
	newId(): string;
}

const clone = <T>(value: T): T => structuredClone(value);

function rootPropsOf(data: DemoPageData): PageRootProps | undefined {
	return data.root?.props as PageRootProps | undefined;
}

function patchRootProps(
	data: DemoPageData,
	patch: Partial<PageRootProps>,
): DemoPageData {
	const next = clone(data);
	const props = (next.root?.props ?? {}) as PageRootProps;
	next.root = {
		...next.root,
		props: { ...props, ...patch },
	} as DemoPageData["root"];
	return next;
}

/**
 * Draft save. Updates `draft` and metadata (title/slug) but never the published
 * payload or `version` (which tracks the published version) — saving a draft on
 * a published page leaves the live document untouched.
 */
export function buildDraftRecord(
	existing: PageRecord | null,
	input: SaveDraftInput,
	ctx: RecordOpsContext,
): PageRecord {
	const data = clone(input.data);
	const props = rootPropsOf(data);
	const now = ctx.nowIso();
	const slug = input.slug ?? props?.slug ?? existing?.slug ?? "";
	const title = input.title ?? props?.title ?? existing?.title ?? "Untitled";

	if (existing !== null) {
		return { ...existing, slug, title, draft: data, updatedAt: now };
	}
	return {
		id: input.id ?? ctx.newId(),
		slug,
		title,
		status: "draft",
		version: props?.version ?? "1.0.0",
		draft: data,
		createdAt: now,
		updatedAt: now,
	};
}

/**
 * Publish. Copies the payload into `published` (and mirrors it into `draft` so a
 * reopened editor starts from the live document), flips status to `published`,
 * clears any archive, and preserves `version` from `root.props.version`.
 */
export function buildPublishRecord(
	existing: PageRecord | null,
	input: PublishPageInput,
	ctx: RecordOpsContext,
): PageRecord {
	const data = clone(input.data);
	const props = rootPropsOf(data);
	const now = ctx.nowIso();
	const slug = input.slug ?? props?.slug ?? existing?.slug ?? "";
	const title = props?.title ?? existing?.title ?? "Untitled";
	const version = props?.version ?? existing?.version ?? "1.0.0";

	if (existing !== null) {
		return {
			...existing,
			slug,
			title,
			status: "published",
			version,
			draft: data,
			published: data,
			updatedAt: now,
			publishedAt: now,
			archivedAt: undefined,
		};
	}
	return {
		id: input.id ?? ctx.newId(),
		slug,
		title,
		status: "published",
		version,
		draft: data,
		published: data,
		createdAt: now,
		updatedAt: now,
		publishedAt: now,
	};
}

/**
 * Settings edit (PATCH). Writes the new `root.props` onto the record metadata
 * and patches it into whichever payloads exist, so SEO/title changes take effect
 * on the live page without a full republish.
 */
export function applySettings(
	existing: PageRecord,
	rootProps: PageRootProps,
	ctx: RecordOpsContext,
): PageRecord {
	const now = ctx.nowIso();
	const next: PageRecord = {
		...existing,
		slug: rootProps.slug,
		title: rootProps.title,
		status: rootProps.status,
		version: rootProps.version,
		updatedAt: now,
	};
	if (existing.draft !== undefined) {
		next.draft = patchRootProps(existing.draft, rootProps);
	}
	if (existing.published !== undefined) {
		next.published = patchRootProps(existing.published, rootProps);
	}
	if (rootProps.status === "archived" && existing.status !== "archived") {
		next.archivedAt = now;
	}
	if (rootProps.status === "published") {
		next.archivedAt = undefined;
		next.publishedAt = existing.publishedAt ?? now;
	}
	return next;
}

/** Archive: hide from the public route, keeping the published payload intact. */
export function applyArchive(
	existing: PageRecord,
	ctx: RecordOpsContext,
): PageRecord {
	const now = ctx.nowIso();
	return { ...existing, status: "archived", archivedAt: now, updatedAt: now };
}

/** Build a fresh draft record cloned from `source` under a new id+slug. */
export function buildDuplicate(
	source: PageRecord,
	input: DuplicatePageInput | undefined,
	ctx: RecordOpsContext,
): PageRecord {
	const now = ctx.nowIso();
	const slug = input?.slug ?? `${source.slug}-copy`;
	const title = input?.title ?? `${source.title} (Copy)`;
	const basis = source.draft ?? source.published;
	const draft =
		basis === undefined
			? undefined
			: patchRootProps(basis, { slug, title, status: "draft" });
	return {
		id: ctx.newId(),
		slug,
		title,
		status: "draft",
		version: source.version,
		draft,
		createdAt: now,
		updatedAt: now,
	};
}

export { clone as cloneRecordValue };
