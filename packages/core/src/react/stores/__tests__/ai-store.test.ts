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

import { useAiStore } from "../ai-store.js";

const STORAGE_KEY = "anvilkit-core-ai";

beforeEach(() => {
	localStorage.clear();
	useAiStore.setState(useAiStore.getInitialState(), true);
});

describe("useAiStore — initial state", () => {
	it("starts with isGenerating === false", () => {
		expect(useAiStore.getState().isGenerating).toBe(false);
	});

	it("starts with null lastPrompt and lastError", () => {
		expect(useAiStore.getState().lastPrompt).toBeNull();
		expect(useAiStore.getState().lastError).toBeNull();
	});

	it("starts with empty history", () => {
		expect(useAiStore.getState().history).toEqual([]);
	});
});

describe("useAiStore — startGeneration", () => {
	it("flips isGenerating to true", () => {
		useAiStore.getState().startGeneration("hello world");
		expect(useAiStore.getState().isGenerating).toBe(true);
	});

	it("stores the prompt as lastPrompt", () => {
		useAiStore.getState().startGeneration("hello world");
		expect(useAiStore.getState().lastPrompt).toBe("hello world");
	});

	it("appends a history entry with a current timestamp", () => {
		const before = Date.now();
		useAiStore.getState().startGeneration("hello world");
		const after = Date.now();

		const history = useAiStore.getState().history;
		expect(history).toHaveLength(1);
		expect(history[0]?.prompt).toBe("hello world");
		expect(history[0]?.at).toBeGreaterThanOrEqual(before);
		expect(history[0]?.at).toBeLessThanOrEqual(after);
	});

	it("clears a prior error when starting a new generation", () => {
		useAiStore.getState().finishGeneration(false, "nope");
		expect(useAiStore.getState().lastError).toBe("nope");
		useAiStore.getState().startGeneration("retry");
		expect(useAiStore.getState().lastError).toBeNull();
	});

	it("preserves prior history entries on each new call", () => {
		useAiStore.getState().startGeneration("one");
		useAiStore.getState().startGeneration("two");
		useAiStore.getState().startGeneration("three");
		expect(useAiStore.getState().history.map((h) => h.prompt)).toEqual([
			"one",
			"two",
			"three",
		]);
	});
});

describe("useAiStore — finishGeneration", () => {
	it("clears isGenerating on success and leaves lastError null", () => {
		useAiStore.getState().startGeneration("hello");
		useAiStore.getState().finishGeneration(true);
		expect(useAiStore.getState().isGenerating).toBe(false);
		expect(useAiStore.getState().lastError).toBeNull();
	});

	it("clears isGenerating on failure and records the error message", () => {
		useAiStore.getState().startGeneration("hello");
		useAiStore.getState().finishGeneration(false, "rate limited");
		expect(useAiStore.getState().isGenerating).toBe(false);
		expect(useAiStore.getState().lastError).toBe("rate limited");
	});

	it("records null when finishGeneration(false) is called without an error string", () => {
		useAiStore.getState().startGeneration("hello");
		useAiStore.getState().finishGeneration(false);
		expect(useAiStore.getState().lastError).toBeNull();
	});

	it("clears a prior error on the next successful finish", () => {
		useAiStore.getState().startGeneration("hello");
		useAiStore.getState().finishGeneration(false, "nope");
		useAiStore.getState().startGeneration("retry");
		useAiStore.getState().finishGeneration(true);
		expect(useAiStore.getState().lastError).toBeNull();
	});
});

describe("useAiStore — clearHistory", () => {
	it("empties the history array", () => {
		useAiStore.getState().startGeneration("one");
		useAiStore.getState().startGeneration("two");
		useAiStore.getState().clearHistory();
		expect(useAiStore.getState().history).toEqual([]);
	});

	it("leaves lastPrompt intact", () => {
		useAiStore.getState().startGeneration("only one");
		useAiStore.getState().clearHistory();
		expect(useAiStore.getState().lastPrompt).toBe("only one");
	});
});

describe("useAiStore — reset()", () => {
	it("returns every field to initial state", () => {
		const store = useAiStore.getState();
		store.startGeneration("hello");
		store.finishGeneration(false, "boom");

		useAiStore.getState().reset();

		const after = useAiStore.getState();
		expect(after.isGenerating).toBe(false);
		expect(after.lastPrompt).toBeNull();
		expect(after.lastError).toBeNull();
		expect(after.history).toEqual([]);
	});

	it("leaves the action functions intact", () => {
		useAiStore.getState().startGeneration("hello");
		useAiStore.getState().reset();
		// Next startGeneration still works — reset must shallow-merge
		// the initial state, not replace the whole store.
		useAiStore.getState().startGeneration("post-reset");
		expect(useAiStore.getState().lastPrompt).toBe("post-reset");
	});
});

describe("useAiStore — persist / partialize", () => {
	it("writes only `history` to localStorage", () => {
		const store = useAiStore.getState();
		store.startGeneration("one");
		store.finishGeneration(false, "boom");

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
			useAiStore.getState().startGeneration(`prompt-${i}`);
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

		await useAiStore.persist.rehydrate();

		const state = useAiStore.getState();
		expect(state.history).toEqual([{ prompt: "cached", at: 1234 }]);
		expect(state.isGenerating).toBe(false);
		expect(state.lastError).toBeNull();
		expect(state.lastPrompt).toBeNull();
	});
});
