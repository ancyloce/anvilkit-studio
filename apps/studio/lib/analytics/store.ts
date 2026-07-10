/**
 * @file The demo's analytics sink. Two interchangeable backends sit behind one
 * synchronous API ({@link recordAnalyticsEvents} / {@link getRecordedAnalyticsEvents}),
 * which is the single seam a real deployment would replace with a
 * warehouse / Kafka / SQLite writer:
 *
 *   - **memory** (default): a bounded ring buffer living for the Next process
 *     lifetime — deterministic for unit tests and the in-process E2E loop.
 *   - **filesystem**: append-only JSONL persistence (survives a dev-server
 *     restart), selected with `ANVILKIT_ANALYTICS_STORE=filesystem`. The path is
 *     `ANVILKIT_ANALYTICS_DIR` (default `<cwd>/.anvilkit/analytics`).
 *
 * Module-level state is shared across `/api/analytics/events`, the stats
 * endpoint, and the server-side publish audit event (all `nodejs` runtime),
 * which is exactly what the inspection / aggregation paths read back. Only
 * primitive, privacy-safe fields are ever persisted (see {@link StoredAnalyticsEvent}).
 */

import fs from "node:fs";
import path from "node:path";
import type {
	ServerEnrichment,
	StoredAnalyticsEvent,
	TrackEvent,
} from "./types";

/** Cap so a long-lived server's in-memory buffer can't grow unbounded. */
const MAX_EVENTS = 5000;

/** The swappable persistence surface. Sync, by design (demo simplicity). */
interface StoreBackend {
	append(events: readonly StoredAnalyticsEvent[]): void;
	all(): readonly StoredAnalyticsEvent[];
	clear(): void;
}

/** In-memory ring buffer — the default, and what tests run against. */
function createMemoryBackend(): StoreBackend {
	let events: StoredAnalyticsEvent[] = [];
	return {
		append(incoming) {
			events.push(...incoming);
			if (events.length > MAX_EVENTS) {
				events = events.slice(events.length - MAX_EVENTS);
			}
		},
		all() {
			return events;
		},
		clear() {
			events = [];
		},
	};
}

/**
 * Append-only JSONL backend. Hydrates once from disk into a memory cache, then
 * mirrors every append to the file. Opt-in via env so tests and the default dev
 * flow stay pure in-memory. Uses sync fs (acceptable for a demo single process).
 */
function createFilesystemBackend(): StoreBackend {
	const dir =
		process.env.ANVILKIT_ANALYTICS_DIR ??
		path.join(process.cwd(), ".anvilkit", "analytics");
	const file = path.join(dir, "events.jsonl");

	let cache: StoredAnalyticsEvent[] | null = null;

	function hydrate(): StoredAnalyticsEvent[] {
		if (cache !== null) return cache;
		try {
			const raw = fs.readFileSync(file, "utf8");
			cache = raw
				.split("\n")
				.filter((line) => line.length > 0)
				.map((line) => JSON.parse(line) as StoredAnalyticsEvent)
				.slice(-MAX_EVENTS);
		} catch {
			cache = []; // missing file / parse error → start fresh
		}
		return cache;
	}

	return {
		append(incoming) {
			const current = hydrate();
			current.push(...incoming);
			if (current.length > MAX_EVENTS) {
				cache = current.slice(current.length - MAX_EVENTS);
			}
			try {
				fs.mkdirSync(dir, { recursive: true });
				fs.appendFileSync(
					file,
					`${incoming.map((e) => JSON.stringify(e)).join("\n")}\n`,
					"utf8",
				);
			} catch {
				// Best-effort persistence; the memory cache still answers reads.
			}
		},
		all() {
			return hydrate();
		},
		clear() {
			cache = [];
			try {
				fs.rmSync(file, { force: true });
			} catch {
				// ignore
			}
		},
	};
}

let backend: StoreBackend | null = null;

function getBackend(): StoreBackend {
	if (backend === null) {
		backend =
			process.env.ANVILKIT_ANALYTICS_STORE === "filesystem"
				? createFilesystemBackend()
				: createMemoryBackend();
	}
	return backend;
}

/**
 * Append validated events with their server receive time + optional per-request
 * enrichment (the same `user_agent` / `ip_hash` applies to every event in one
 * HTTP batch). The enrichment is server-derived and privacy-safe — the raw IP
 * is never passed here, only its salted hash.
 */
export function recordAnalyticsEvents(
	incoming: readonly TrackEvent[],
	receivedAt: number,
	enrichment: ServerEnrichment = {},
): void {
	const stored: StoredAnalyticsEvent[] = incoming.map((event) => ({
		...event,
		received_at: receivedAt,
		...(enrichment.user_agent !== undefined
			? { user_agent: enrichment.user_agent }
			: {}),
		...(enrichment.ip_hash !== undefined
			? { ip_hash: enrichment.ip_hash }
			: {}),
	}));
	getBackend().append(stored);
}

/** Snapshot of every recorded event (newest last). For stats / inspection / tests. */
export function getRecordedAnalyticsEvents(): readonly StoredAnalyticsEvent[] {
	return getBackend().all();
}

/** Recorded events filtered by `event_name`. */
export function getRecordedAnalyticsEventsByName(
	name: string,
): readonly StoredAnalyticsEvent[] {
	return getBackend()
		.all()
		.filter((event) => event.event_name === name);
}

/** Reset the buffer — used by tests for isolation. */
export function clearAnalyticsEvents(): void {
	getBackend().clear();
}
