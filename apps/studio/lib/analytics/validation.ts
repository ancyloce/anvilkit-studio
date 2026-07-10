/**
 * @file Server-side validation for the analytics ingestion endpoint. This is
 * the trust boundary: the client adapter already sanitizes, but the server
 * MUST re-validate independently and enforce the privacy contract — only the
 * allowed event names, only the two known sources, primitive-only properties,
 * and an explicit deny-list for heavy/sensitive fields (full Puck `Data`, HTML,
 * DOM, `root` / `root.props`, …) so they can never be persisted or logged.
 */

import { ANALYTICS_EVENTS } from "@anvilkit/analytics-core";
import type { TrackEvent } from "./types";

/** The fixed set of system event names (plus the `$`-prefixed adapter events). */
const ALLOWED_EVENT_NAMES = new Set<string>(Object.values(ANALYTICS_EVENTS));

const ALLOWED_SOURCES = new Set(["studio", "published_site"]);

/**
 * Heavy/sensitive keys that must never appear on an event or in its
 * properties. Rejecting (not silently dropping) makes a privacy-boundary
 * regression a loud test failure rather than a quiet leak.
 */
const FORBIDDEN_FIELDS = [
	"data",
	"html",
	"dom",
	"root",
	"rootProps",
	"puckData",
	"serializedHtml",
] as const;
const FORBIDDEN_FIELD_SET = new Set<string>(FORBIDDEN_FIELDS);

/** A single validation problem, scoped to the offending event index/field. */
export interface AnalyticsIssue {
	readonly index: number;
	readonly field: string;
	readonly message: string;
}

export type AnalyticsValidationResult =
	| { readonly ok: true; readonly events: TrackEvent[] }
	| {
			readonly ok: false;
			readonly message: string;
			readonly issues: AnalyticsIssue[];
	  };

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): value is string | number | boolean {
	return (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	);
}

/** Validate the optional privacy `meta`; returns issues (index `-1`). */
function validateMeta(meta: unknown, issues: AnalyticsIssue[]): void {
	if (meta === undefined) return;
	if (!isPlainObject(meta)) {
		issues.push({
			index: -1,
			field: "meta",
			message: "meta must be an object.",
		});
		return;
	}
	if (
		meta.source !== undefined &&
		!ALLOWED_SOURCES.has(meta.source as string)
	) {
		issues.push({
			index: -1,
			field: "meta.source",
			message: 'meta.source must be "studio" or "published_site".',
		});
	}
	if (meta.truncate_ip !== undefined && typeof meta.truncate_ip !== "boolean") {
		issues.push({
			index: -1,
			field: "meta.truncate_ip",
			message: "meta.truncate_ip must be a boolean.",
		});
	}
	if (
		meta.retention_days !== undefined &&
		typeof meta.retention_days !== "number"
	) {
		issues.push({
			index: -1,
			field: "meta.retention_days",
			message: "meta.retention_days must be a number.",
		});
	}
}

/** Validate a single event envelope; pushes any issues for its `index`. */
function validateEvent(
	event: unknown,
	index: number,
	issues: AnalyticsIssue[],
): void {
	if (!isPlainObject(event)) {
		issues.push({
			index,
			field: "event",
			message: "Each event must be an object.",
		});
		return;
	}

	// Forbidden fields anywhere on the envelope (the privacy deny-list).
	for (const key of Object.keys(event)) {
		if (FORBIDDEN_FIELD_SET.has(key)) {
			issues.push({
				index,
				field: key,
				message: `Forbidden field "${key}" is not allowed on an analytics event.`,
			});
		}
	}

	const name = event.event_name;
	if (typeof name !== "string" || name.length === 0) {
		issues.push({
			index,
			field: "event_name",
			message: "event_name must be a non-empty string.",
		});
	} else if (!ALLOWED_EVENT_NAMES.has(name) && !name.startsWith("$")) {
		issues.push({
			index,
			field: "event_name",
			message: `event_name "${name}" is not an allowed analytics event.`,
		});
	}

	if (!ALLOWED_SOURCES.has(event.source as string)) {
		issues.push({
			index,
			field: "source",
			message: 'source must be "studio" or "published_site".',
		});
	}

	const { properties } = event;
	if (properties !== undefined) {
		if (!isPlainObject(properties)) {
			issues.push({
				index,
				field: "properties",
				message: "properties must be an object.",
			});
		} else {
			for (const [key, value] of Object.entries(properties)) {
				if (FORBIDDEN_FIELD_SET.has(key)) {
					issues.push({
						index,
						field: `properties.${key}`,
						message: `Forbidden field "${key}" is not allowed in properties.`,
					});
				}
				if (!isPrimitive(value)) {
					issues.push({
						index,
						field: `properties.${key}`,
						message: `properties.${key} must be a string, number, or boolean.`,
					});
				}
			}
		}
	}
}

/**
 * Validate an ingestion request body. The whole batch is rejected if ANY event
 * fails — a privacy boundary should never partially accept a mixed batch.
 */
export function validateAnalyticsIngest(
	body: unknown,
): AnalyticsValidationResult {
	if (!isPlainObject(body)) {
		return {
			ok: false,
			message: "Request body must be a JSON object.",
			issues: [{ index: -1, field: "body", message: "Expected an object." }],
		};
	}

	const { events } = body;
	if (!Array.isArray(events)) {
		return {
			ok: false,
			message: "`events` must be an array.",
			issues: [
				{ index: -1, field: "events", message: "`events` must be an array." },
			],
		};
	}

	const issues: AnalyticsIssue[] = [];
	validateMeta(body.meta, issues);
	events.forEach((event, index) => {
		validateEvent(event, index, issues);
	});

	if (issues.length > 0) {
		return {
			ok: false,
			message: issues[0]?.message ?? "Invalid analytics payload.",
			issues,
		};
	}
	return { ok: true, events: events as TrackEvent[] };
}
