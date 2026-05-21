/**
 * @file Tests for `useAiStore` (task `core-013`).
 *
 * Coverage targets:
 *
 * - Initial state matches the documented defaults.
 * - `startGeneration` flips the in-flight flag, stashes the prompt,
 *   clears any prior error, and appends a history entry.
 * - `finishGeneration(true)` clears the flag and leaves no error.
 * - `finishGeneration(false, msg)` records the error.
 * - `clearHistory` empties the history array.
 * - `reset()` returns every field to its initial state.
 * - `persist`'s `partialize` writes **only** a bounded history —
 *   never `isGenerating`, `lastPrompt`, or `lastError`.
 * - The persisted history is trimmed to at most the last 10 entries.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { type AiStoreApi, createAiStore } from "@/stores/ai-store";

type PersistableStore = { persist: { rehydrate(): Promise<void> } };
function persistOf(store: AiStoreApi): PersistableStore {
	return store as unknown as PersistableStore;
}

const STORE_ID = "test";
const STORAGE_KEY = `anvilkit-core-ai-${STORE_ID}`;
let store: AiStoreApi;

beforeEach(() => {
	localStorage.clear();
	store = createAiStore({ storeId: STORE_ID });
});

describe("useAiStore — initial state", () => {
	it("starts with isGenerating === false", () => {
		expect(store.getState().isGenerating).toBe(false);
	});

	it("starts with null lastPrompt and lastError", () => {
		expect(store.getState().lastPrompt).toBeNull();
		expect(store.getState().lastError).toBeNull();
	});

	it("starts with empty history", () => {
		expect(store.getState().history).toEqual([]);
	});
});

describe("useAiStore — startGeneration", () => {
	it("flips isGenerating to true", () => {
		store.getState().startGeneration("hello world");
		expect(store.getState().isGenerating).toBe(true);
	});

	it("stores the prompt as lastPrompt", () => {
		store.getState().startGeneration("hello world");
		expect(store.getState().lastPrompt).toBe("hello world");
	});

	it("appends a history entry with a current timestamp", () => {
		const before = Date.now();
		store.getState().startGeneration("hello world");
		const after = Date.now();

		const history = store.getState().history;
		expect(history).toHaveLength(1);
		expect(history[0]?.prompt).toBe("hello world");
		expect(history[0]?.at).toBeGreaterThanOrEqual(before);
		expect(history[0]?.at).toBeLessThanOrEqual(after);
	});

	it("clears a prior error when starting a new generation", () => {
		store.getState().finishGeneration(false, "nope");
		expect(store.getState().lastError).toBe("nope");
		store.getState().startGeneration("retry");
		expect(store.getState().lastError).toBeNull();
	});

	it("preserves prior history entries on each new call", () => {
		store.getState().startGeneration("one");
		store.getState().startGeneration("two");
		store.getState().startGeneration("three");
		expect(
			store.getState().history.map((h: { prompt: string }) => h.prompt),
		).toEqual(["one", "two", "three"]);
	});
});

describe("useAiStore — finishGeneration", () => {
	it("clears isGenerating on success and leaves lastError null", () => {
		store.getState().startGeneration("hello");
		store.getState().finishGeneration(true);
		expect(store.getState().isGenerating).toBe(false);
		expect(store.getState().lastError).toBeNull();
	});

	it("clears isGenerating on failure and records the error message", () => {
		store.getState().startGeneration("hello");
		store.getState().finishGeneration(false, "rate limited");
		expect(store.getState().isGenerating).toBe(false);
		expect(store.getState().lastError).toBe("rate limited");
	});

	it("records null when finishGeneration(false) is called without an error string", () => {
		store.getState().startGeneration("hello");
		store.getState().finishGeneration(false);
		expect(store.getState().lastError).toBeNull();
	});

	it("clears a prior error on the next successful finish", () => {
		store.getState().startGeneration("hello");
		store.getState().finishGeneration(false, "nope");
		store.getState().startGeneration("retry");
		store.getState().finishGeneration(true);
		expect(store.getState().lastError).toBeNull();
	});
});

describe("useAiStore — clearHistory", () => {
	it("empties the history array", () => {
		store.getState().startGeneration("one");
		store.getState().startGeneration("two");
		store.getState().clearHistory();
		expect(store.getState().history).toEqual([]);
	});

	it("leaves lastPrompt intact", () => {
		store.getState().startGeneration("only one");
		store.getState().clearHistory();
		expect(store.getState().lastPrompt).toBe("only one");
	});
});

describe("useAiStore — reset()", () => {
	it("returns every field to initial state", () => {
		const actions = store.getState();
		actions.startGeneration("hello");
		actions.finishGeneration(false, "boom");

		store.getState().reset();

		const after = store.getState();
		expect(after.isGenerating).toBe(false);
		expect(after.lastPrompt).toBeNull();
		expect(after.lastError).toBeNull();
		expect(after.history).toEqual([]);
	});

	it("leaves the action functions intact", () => {
		store.getState().startGeneration("hello");
		store.getState().reset();
		// Next startGeneration still works — reset must shallow-merge
		// the initial state, not replace the whole store.
		store.getState().startGeneration("post-reset");
		expect(store.getState().lastPrompt).toBe("post-reset");
	});
});

describe("useAiStore — persist / partialize", () => {
	it("writes only `history` to localStorage", () => {
		const actions = store.getState();
		actions.startGeneration("one");
		actions.finishGeneration(false, "boom");

		const raw = localStorage.getItem(STORAGE_KEY);
		expect(raw).not.toBeNull();
		const parsed = JSON.parse(raw as string) as {
			state: Record<string, unknown>;
			version: number;
		};
		expect(Object.keys(parsed.state)).toEqual(["history"]);
		expect(parsed.state).not.toHaveProperty("isGenerating");
		expect(parsed.state).not.toHaveProperty("lastPrompt");
		expect(parsed.state).not.toHaveProperty("lastError");
	});

	it("trims the persisted history to the last 10 entries", () => {
		// Push 15 prompts; partialize should only serialize the tail 10.
		for (let i = 0; i < 15; i += 1) {
			store.getState().startGeneration(`prompt-${i}`);
		}

		const raw = localStorage.getItem(STORAGE_KEY) as string;
		const parsed = JSON.parse(raw) as {
			state: { history: Array<{ prompt: string; at: number }> };
		};
		expect(parsed.state.history).toHaveLength(10);
		// The first surviving entry is #5 (we kept the tail).
		expect(parsed.state.history[0]?.prompt).toBe("prompt-5");
		expect(parsed.state.history[9]?.prompt).toBe("prompt-14");
	});

	it("rehydrating from a partial blob does not set isGenerating to true", async () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				state: { history: [{ prompt: "cached", at: 1234 }] },
				version: 0,
			}),
		);

		await persistOf(store).persist.rehydrate();

		const state = store.getState();
		expect(state.history).toEqual([{ prompt: "cached", at: 1234 }]);
		expect(state.isGenerating).toBe(false);
		expect(state.lastError).toBeNull();
		expect(state.lastPrompt).toBeNull();
	});
});
