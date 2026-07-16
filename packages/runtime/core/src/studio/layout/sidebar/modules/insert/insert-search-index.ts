/**
 * @file Memoized search index + ranking for the Insert panel.
 *
 * The previous search path re-derived each component's presentation
 * (label + metadata reads + `toLowerCase` per field) for EVERY
 * component on EVERY keystroke, and returned an unranked boolean
 * match. This module normalizes once per library shape
 * (`buildInsertSearchIndex`, memoized by the caller) and ranks each
 * hit so exact/prefix title matches surface above weaker keyword or
 * description hits:
 *
 * | rank | match |
 * |-----:|---|
 * | 0 | exact title or raw component name |
 * | 1 | title/name prefix |
 * | 2 | title/name substring |
 * | 3 | keyword match |
 * | 4 | description or category substring |
 * | ∞ | no match ({@link NO_MATCH}) |
 *
 * Sorting is stable: equal ranks keep the library's original order.
 */

import { readComponentPresentation } from "@/overrides/utils/component-presentation";

export interface InsertSearchRecord {
	readonly name: string;
	readonly nameLower: string;
	readonly titleLower: string;
	readonly descriptionLower: string | undefined;
	readonly keywordsLower: readonly string[];
	readonly categoryLower: string | undefined;
}

interface PresentationSourceConfig {
	readonly components?: Readonly<
		Record<string, { label?: string; metadata?: unknown } | undefined>
	>;
}

/**
 * Normalize every component once. The caller memoizes on
 * `[names, config, categoryIndex]`, so keystrokes never re-run this.
 */
export function buildInsertSearchIndex(
	names: readonly string[],
	config: PresentationSourceConfig | undefined,
	categoryIndex: ReadonlyMap<string, string>,
): ReadonlyMap<string, InsertSearchRecord> {
	const index = new Map<string, InsertSearchRecord>();
	for (const name of names) {
		if (index.has(name)) continue;
		const presentation = readComponentPresentation(
			config?.components?.[name],
			name,
		);
		index.set(name, {
			name,
			nameLower: name.toLowerCase(),
			titleLower: presentation.title.toLowerCase(),
			descriptionLower: presentation.description?.toLowerCase(),
			keywordsLower: (presentation.keywords ?? []).map((keyword) =>
				keyword.toLowerCase(),
			),
			categoryLower: categoryIndex.get(name)?.toLowerCase(),
		});
	}
	return index;
}

/** Rank for "no match" — filter these out before sorting. */
export const NO_MATCH = Number.POSITIVE_INFINITY;

/**
 * Rank a record against a pre-normalized (trimmed, lowercased) query.
 * Lower is better; {@link NO_MATCH} means the record does not match.
 */
export function rankInsertMatch(
	record: InsertSearchRecord,
	queryLower: string,
): number {
	if (queryLower.length === 0) return 0;
	if (record.titleLower === queryLower || record.nameLower === queryLower) {
		return 0;
	}
	if (
		record.titleLower.startsWith(queryLower) ||
		record.nameLower.startsWith(queryLower)
	) {
		return 1;
	}
	if (
		record.titleLower.includes(queryLower) ||
		record.nameLower.includes(queryLower)
	) {
		return 2;
	}
	if (record.keywordsLower.some((keyword) => keyword.includes(queryLower))) {
		return 3;
	}
	if (
		record.descriptionLower?.includes(queryLower) === true ||
		record.categoryLower?.includes(queryLower) === true
	) {
		return 4;
	}
	return NO_MATCH;
}

/** Trim + lowercase a raw search query once per change. */
export function normalizeInsertQuery(query: string): string {
	return query.trim().toLowerCase();
}
