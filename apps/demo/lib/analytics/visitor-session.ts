/**
 * @file Privacy-safe anonymous visitor + session identity for the demo's
 * PUBLISHED-page analytics. No authentication, no PII — just two opaque,
 * client-generated ids stored in `localStorage`:
 *
 *   - `visitor_id` (`anon_…`): persistent across visits (uniqueness signal).
 *   - `session_id`  (`sess_…`): rolls over after 30 minutes of inactivity.
 *
 * Both are sent as PRIMITIVE event properties (the transport never sees a
 * cookie or a fingerprint). The functions take an injectable `storage` + `now`
 * so they unit-test under the node preset without a real DOM, and degrade to
 * fresh, non-persisted ids when storage is unavailable (SSR / private mode).
 */

/** The minimal `localStorage`-shaped surface these helpers need. */
export interface KeyValueStore {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/** Storage keys — namespaced so they never collide with app/editor state. */
export const VISITOR_STORAGE_KEY = "anvilkit:analytics:visitor";
export const SESSION_STORAGE_KEY = "anvilkit:analytics:session";

/** Session rolls over after this much inactivity. */
export const SESSION_IDLE_MS = 30 * 60 * 1000; // 30 minutes

/** Persisted session envelope: the id plus the last-activity watermark. */
interface SessionState {
	readonly id: string;
	readonly lastActivity: number;
}

/** Best-effort `crypto.randomUUID`, with a non-crypto fallback for old runtimes. */
function randomToken(): string {
	const c = globalThis.crypto;
	if (typeof c?.randomUUID === "function") return c.randomUUID();
	// Fallback: timestamp + two random chunks. Not cryptographic, but adequate
	// for an anonymous client id when `crypto` is unavailable.
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Resolve the ambient `localStorage`, or `null` when it isn't usable. */
function defaultStorage(): KeyValueStore | null {
	try {
		if (typeof window === "undefined" || !window.localStorage) return null;
		return window.localStorage;
	} catch {
		// Accessing localStorage can throw in sandboxed iframes / private mode.
		return null;
	}
}

/**
 * Return a stable anonymous visitor id, creating + persisting one on first use.
 * Falls back to an ephemeral id (not persisted) when storage is unavailable.
 */
export function getVisitorId(
	storage: KeyValueStore | null = defaultStorage(),
): string {
	if (storage === null) return `anon_${randomToken()}`;
	try {
		const existing = storage.getItem(VISITOR_STORAGE_KEY);
		if (existing) return existing;
		const id = `anon_${randomToken()}`;
		storage.setItem(VISITOR_STORAGE_KEY, id);
		return id;
	} catch {
		return `anon_${randomToken()}`;
	}
}

/**
 * Return the current session id, minting a new one when none exists or the
 * previous one has been idle for {@link SESSION_IDLE_MS}. Always refreshes the
 * `lastActivity` watermark so an active visit keeps the same session.
 *
 * `now` is injectable for deterministic tests.
 */
export function getSessionId(
	storage: KeyValueStore | null = defaultStorage(),
	now: number = Date.now(),
): string {
	const mint = (): string => `sess_${randomToken()}`;
	if (storage === null) return mint();

	try {
		const raw = storage.getItem(SESSION_STORAGE_KEY);
		let id: string | undefined;
		if (raw) {
			const parsed = JSON.parse(raw) as Partial<SessionState>;
			if (
				typeof parsed.id === "string" &&
				typeof parsed.lastActivity === "number" &&
				now - parsed.lastActivity < SESSION_IDLE_MS
			) {
				id = parsed.id;
			}
		}
		const sessionId = id ?? mint();
		const next: SessionState = { id: sessionId, lastActivity: now };
		storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
		return sessionId;
	} catch {
		return mint();
	}
}

/** Convenience: both ids in one call (used by the published-page tracker). */
export function getVisitorAndSession(
	storage: KeyValueStore | null = defaultStorage(),
	now: number = Date.now(),
): { visitorId: string; sessionId: string } {
	return {
		visitorId: getVisitorId(storage),
		sessionId: getSessionId(storage, now),
	};
}
