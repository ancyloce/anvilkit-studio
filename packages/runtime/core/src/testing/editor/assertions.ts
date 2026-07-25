/**
 * @file Editor contract assertion helpers (PLAN-0020 CORE-P0-017).
 *
 * Two contracts every phase re-checks:
 *
 * 1. **Single-intent history rule** (DD-0019 §10.5): at most one
 *    history-recording dispatch per user intent. The probe wraps a
 *    dispatch function and counts `recordHistory: true` dispatches.
 * 2. **Event privacy** (DD-0019 §22.4): operational events carry no
 *    text, URLs, prop values, token literals, or preview data.
 */

import type { EditorEvent } from "@anvilkit/contracts/editor";

/** A dispatch-counting probe for the single-intent history rule. */
export interface HistoryRecordingProbe {
	/** Wrap a dispatch fn; counted calls pass through untouched. */
	wrap<A extends { readonly recordHistory?: boolean }>(
		dispatch: (action: A) => void,
	): (action: A) => void;
	/** History-recording dispatches observed so far. */
	count(): number;
	/** Reset the counter between intents. */
	reset(): void;
	/** Assert at most one recording dispatch since the last reset. */
	assertSingleIntent(): void;
}

/** Create a {@link HistoryRecordingProbe}. */
export function createHistoryRecordingProbe(): HistoryRecordingProbe {
	let recorded = 0;
	return {
		wrap(dispatch) {
			return (action) => {
				if (action.recordHistory === true) {
					recorded += 1;
				}
				dispatch(action);
			};
		},
		count() {
			return recorded;
		},
		reset() {
			recorded = 0;
		},
		assertSingleIntent() {
			if (recorded > 1) {
				throw new Error(
					`single-intent history rule violated: ${recorded} history-recording dispatches for one intent (DD-0019 §10.5)`,
				);
			}
		},
	};
}

const EVENT_ALLOWED_KEYS: Readonly<Record<string, readonly string[]>> = {
	"command.committed": [
		"type",
		"commandType",
		"source",
		"durationMs",
		"changedNodeCount",
	],
	"command.rejected": ["type", "commandType", "errorCodes"],
	"gesture.completed": ["type", "gesture", "durationMs"],
	"diagnostic.changed": ["type", "severity", "count"],
	"export.validation": ["type", "status", "featureIds"],
};

/**
 * Assert an operational event is content-free (DD-0019 §22.4): only
 * the schema-declared keys are present, and no string value looks
 * like a URL or free text beyond identifier length.
 */
export function assertContentFreeEvent(event: EditorEvent): void {
	const allowed = EVENT_ALLOWED_KEYS[event.type];
	if (allowed === undefined) {
		throw new Error(`unknown editor event type "${event.type}"`);
	}
	for (const key of Object.keys(event)) {
		if (!allowed.includes(key)) {
			throw new Error(
				`event "${event.type}" carries undeclared key "${key}" — events must stay content-free (DD-0019 §22.4)`,
			);
		}
	}
	for (const [key, value] of Object.entries(event)) {
		if (typeof value !== "string") {
			continue;
		}
		if (/https?:|mailto:|tel:/.test(value)) {
			throw new Error(
				`event "${event.type}" key "${key}" carries a URL — events must stay content-free`,
			);
		}
		if (value.length > 128) {
			throw new Error(
				`event "${event.type}" key "${key}" carries free text (${value.length} chars) — events must stay content-free`,
			);
		}
	}
}
