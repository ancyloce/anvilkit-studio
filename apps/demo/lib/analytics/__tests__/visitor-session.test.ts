/**
 * @file Anonymous visitor + session identity tests. Uses an injected in-memory
 * `KeyValueStore` + explicit `now` so the localStorage-backed helpers run under
 * the node preset without a DOM.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
	getSessionId,
	getVisitorId,
	type KeyValueStore,
	SESSION_IDLE_MS,
} from "../visitor-session";

function memoryStore(): KeyValueStore {
	const map = new Map<string, string>();
	return {
		getItem: (k) => map.get(k) ?? null,
		setItem: (k, v) => void map.set(k, v),
	};
}

let store: KeyValueStore;
beforeEach(() => {
	store = memoryStore();
});

describe("getVisitorId", () => {
	it("mints an anon_ id and persists it across calls", () => {
		const first = getVisitorId(store);
		expect(first).toMatch(/^anon_/);
		expect(getVisitorId(store)).toBe(first); // stable
	});

	it("returns an ephemeral id when storage is unavailable", () => {
		const id = getVisitorId(null);
		expect(id).toMatch(/^anon_/);
		expect(getVisitorId(null)).not.toBe(id); // not persisted
	});
});

describe("getSessionId", () => {
	it("mints a sess_ id and reuses it within the idle window", () => {
		const t0 = 1_000_000;
		const first = getSessionId(store, t0);
		expect(first).toMatch(/^sess_/);
		// Still active 5 minutes later.
		expect(getSessionId(store, t0 + 5 * 60 * 1000)).toBe(first);
	});

	it("rolls over to a new session after the idle timeout", () => {
		const t0 = 1_000_000;
		const first = getSessionId(store, t0);
		const later = getSessionId(store, t0 + SESSION_IDLE_MS + 1);
		expect(later).not.toBe(first);
		expect(later).toMatch(/^sess_/);
	});

	it("keeps the session alive across activity that refreshes the watermark", () => {
		const t0 = 1_000_000;
		const id = getSessionId(store, t0);
		// Activity every 20 min keeps the same session past the 30-min raw window.
		const t1 = t0 + 20 * 60 * 1000;
		expect(getSessionId(store, t1)).toBe(id);
		const t2 = t1 + 20 * 60 * 1000;
		expect(getSessionId(store, t2)).toBe(id);
	});
});
