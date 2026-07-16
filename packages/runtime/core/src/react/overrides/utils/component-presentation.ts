/**
 * @file `readComponentPresentation()` — Insert-panel tile presentation
 * (task Phase 9).
 *
 * Adapts the task's `StudioComponentPresentation` contract to Puck's
 * OWN existing extension points rather than inventing a disconnected
 * metadata system:
 *
 * - `title` comes from `ComponentConfig.label` (already Puck-native,
 *   already used the same way for the Layer tree and canvas overlay
 *   labels) — falls back to the raw component name.
 * - `description` / `thumbnail` / `keywords` / `icon` / `preview` come
 *   from `ComponentConfig.metadata` — Puck's own open per-component
 *   metadata bag (`interface ComponentMetadata extends PuckMetadata
 *   {}`, ultimately `{[key: string]: any}`), the SAME extension point
 *   Phase 7's `NumberField` unit hint already reads from (there, the
 *   per-*field* `metadata`; here, the per-*component* one). No
 *   component package currently sets any of these — every field is
 *   optional and falls back to the existing generic-placeholder
 *   behavior, so this is purely additive.
 * - `category` is intentionally NOT read from metadata: Puck's own
 *   `Config.categories` map is already the authoritative
 *   categorization mechanism `component-category-index.ts` builds
 *   from — duplicating it here would create two disagreeing sources.
 */

import { isValidElement, type ReactNode } from "react";

export interface StudioComponentPresentation {
	readonly title: string;
	readonly description?: string;
	readonly icon?: ReactNode;
	readonly thumbnail?: string;
	readonly preview?: ReactNode;
	readonly keywords?: readonly string[];
}

interface PresentationSourceConfig {
	readonly label?: string;
	readonly metadata?: unknown;
}

function readStringField(
	metadata: Record<string, unknown>,
	key: string,
): string | undefined {
	const value = metadata[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNodeField(
	metadata: Record<string, unknown>,
	key: string,
): ReactNode | undefined {
	const value = metadata[key];
	return isValidElement(value) ? value : undefined;
}

function readKeywords(
	metadata: Record<string, unknown>,
): readonly string[] | undefined {
	const value = metadata.keywords;
	if (!Array.isArray(value)) return undefined;
	const keywords = value.filter(
		(entry): entry is string => typeof entry === "string" && entry.length > 0,
	);
	return keywords.length > 0 ? keywords : undefined;
}

export function readComponentPresentation(
	componentConfig: PresentationSourceConfig | undefined,
	name: string,
): StudioComponentPresentation {
	const metadata =
		componentConfig?.metadata !== null &&
		typeof componentConfig?.metadata === "object"
			? (componentConfig.metadata as Record<string, unknown>)
			: {};

	return {
		title: componentConfig?.label ?? name,
		description: readStringField(metadata, "description"),
		thumbnail: readStringField(metadata, "thumbnail"),
		icon: readNodeField(metadata, "icon"),
		preview: readNodeField(metadata, "preview"),
		keywords: readKeywords(metadata),
	};
}

/**
 * Whether `presentation` (plus the raw component `name`) matches a
 * lowercased search query — task Phase 9: "search should match name,
 * keywords, description, category." Category is handled by the
 * caller (it already has the category index; presentation doesn't
 * carry it, see file doc), so this only covers the fields
 * presentation actually owns.
 */
export function matchesPresentationQuery(
	presentation: Pick<
		StudioComponentPresentation,
		"title" | "description" | "keywords"
	>,
	name: string,
	query: string,
): boolean {
	if (query.length === 0) return true;
	const q = query.toLowerCase();
	if (name.toLowerCase().includes(q)) return true;
	if (presentation.title.toLowerCase().includes(q)) return true;
	if (presentation.description?.toLowerCase().includes(q) === true) {
		return true;
	}
	return (
		presentation.keywords?.some((keyword) =>
			keyword.toLowerCase().includes(q),
		) === true
	);
}
