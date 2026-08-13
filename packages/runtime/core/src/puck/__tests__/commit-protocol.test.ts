/**
 * @file Regression tests for review 0036 M-2 and review 0037 P1-1 — a
 * commit must report what actually reached Puck's reducer.
 *
 * Every `commit*` helper dispatched a `setData` whose functional updater
 * re-derives the intent when the document moved between validation and
 * the reducer. That part was right. The bookkeeping around it was not:
 *
 *  - the return value was decided from the FIRST (speculative) run, so a
 *    retry that came back `noop`/`rejected` still reported
 *    `"committed"`; and
 *  - `recordHistory: true` is fixed on the action, so Puck recorded the
 *    unchanged state anyway — an undo entry that appears to do nothing.
 *
 * `dispatchOneIntent` reports the functional updater's outcome. These
 * tests model the real Puck contract: one `PuckApi` has one stable
 * `appState` snapshot, while the functional updater can receive a newer
 * document from the store during dispatch.
 */

import type { Data, PuckApi } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
	dispatchOneIntent,
	failureStatus,
	type IntentOutcome,
} from "../commit-protocol.js";

function docWith(title: string): Data {
	return {
		root: { props: { title } },
		content: [],
	} as unknown as Data;
}

interface Dispatched {
	readonly type: string;
	readonly recordHistory: boolean;
	readonly data: (previous: Data) => Data;
}

/**
 * A `PuckApi` double with the same snapshot semantics as the real API.
 * The proxy only counts property reads; every read returns the same
 * plain `appState` value.
 */
function fakeApi(document: Data) {
	const dispatched: Dispatched[] = [];
	let written = document;
	let appStateReads = 0;
	const target = {
		appState: { data: document },
		config: { root: { fields: {} }, components: {} },
		dispatch: (action: Dispatched) => {
			dispatched.push(action);
			written = action.data(document);
		},
	};
	const api = new Proxy(target, {
		get(current, property, receiver) {
			if (property === "appState") appStateReads += 1;
			return Reflect.get(current, property, receiver);
		},
	}) as unknown as PuckApi;
	return {
		api,
		dispatched,
		appStateReads: () => appStateReads,
		written: () => written,
	};
}

/** A run that always reports `updated`, swapping in `next`. */
function alwaysUpdates(next: Data) {
	return (): IntentOutcome => ({ data: next, status: "updated", errors: [] });
}

describe("dispatchOneIntent — honest outcomes (0036 M-2)", () => {
	it("dispatches and reports committed on the ordinary path", () => {
		const start = docWith("a");
		const next = docWith("b");
		const { api, dispatched, written } = fakeApi(start);

		const attempt = dispatchOneIntent(api, alwaysUpdates(next));

		expect(attempt.committed).toBe(true);
		expect(attempt.outcome.status).toBe("updated");
		expect(dispatched).toHaveLength(1);
		expect(dispatched[0]?.recordHistory).toBe(true);
		expect(written()).toBe(next);
	});

	it("reads one stable PuckApi snapshot before dispatch", () => {
		const start = docWith("a");
		const next = docWith("b");
		const { api, appStateReads } = fakeApi(start);

		dispatchOneIntent(api, alwaysUpdates(next));

		// A real PuckApi does not become fresher when appState is read again.
		// Before review 0037 P1-1 the protocol performed a dead second read.
		expect(appStateReads()).toBe(1);
	});

	it("does not dispatch at all when the first run is a noop", () => {
		const start = docWith("a");
		const { api, dispatched } = fakeApi(start);

		const attempt = dispatchOneIntent(api, (data) => ({
			data,
			status: "noop",
			errors: [],
		}));

		expect(attempt.committed).toBe(false);
		expect(failureStatus(attempt.outcome)).toBe("noop");
		expect(dispatched).toHaveLength(0);
	});

	it("reports noop when the functional updater receives a moved document", () => {
		const first = docWith("a");
		const moved = docWith("moved");
		let written: Data | undefined;
		const api = {
			appState: { data: first },
			config: {},
			dispatch: (action: Dispatched) => {
				written = action.data(moved);
			},
		} as unknown as PuckApi;

		const attempt = dispatchOneIntent(api, (data) =>
			data === first
				? { data: docWith("b"), status: "updated", errors: [] }
				: { data, status: "noop", errors: [] },
		);

		expect(written).toBe(moved);
		expect(attempt.committed).toBe(false);
		expect(attempt.outcome.status).toBe("noop");
	});

	it("reports rejected — with its errors — when the updater retry refuses", () => {
		const first = docWith("a");
		const moved = docWith("moved");
		let written: Data | undefined;
		const api = {
			appState: { data: first },
			config: {},
			dispatch: (action: Dispatched) => {
				written = action.data(moved);
			},
		} as unknown as PuckApi;
		const error = {
			code: "EDITOR_NODE_NOT_FOUND",
			message: "gone",
		} as unknown as IntentOutcome["errors"][number];

		const attempt = dispatchOneIntent(api, (data) =>
			data === first
				? { data: docWith("b"), status: "updated", errors: [] }
				: { data, status: "rejected", errors: [error] },
		);

		expect(written).toBe(moved);
		expect(attempt.committed).toBe(false);
		expect(failureStatus(attempt.outcome)).toBe("rejected");
		expect(attempt.outcome.errors).toEqual([error]);
	});

	it("re-derives against the document received by the functional updater", () => {
		const first = docWith("a");
		const moved = docWith("moved");
		const rederived = docWith("rederived");
		let written: Data | undefined;
		const api = {
			appState: { data: first },
			config: {},
			dispatch: (action: Dispatched) => {
				written = action.data(moved);
			},
		} as unknown as PuckApi;

		const attempt = dispatchOneIntent(api, (data) =>
			data === moved
				? { data: rederived, status: "updated", errors: [] }
				: { data: docWith("stale"), status: "updated", errors: [] },
		);

		expect(attempt.committed).toBe(true);
		expect(written).toBe(rederived);
	});

	it("reports the retry's outcome when the document moves during the reduce", () => {
		// The updater itself receives a `previous` the API snapshot did not
		// contain. Puck reduces SYNCHRONOUSLY (`dispatch: (action) => set((s) =>
		// …)`), so this double does the same — which is what makes the real
		// outcome readable by the time `dispatch` returns.
		const start = docWith("a");
		const duringReduce = docWith("during");
		let written: Data | undefined;
		const api = {
			appState: { data: start },
			config: {},
			dispatch: (action: Dispatched) => {
				written = action.data(duringReduce);
			},
		} as unknown as PuckApi;

		const attempt = dispatchOneIntent(api, (data) =>
			data === start
				? { data: docWith("b"), status: "updated", errors: [] }
				: { data, status: "noop", errors: [] },
		);

		// The retry declined, so the document is handed back untouched...
		expect(written).toBe(duringReduce);
		// ...and the caller is told so, rather than "committed".
		expect(attempt.committed).toBe(false);
		expect(attempt.outcome.status).toBe("noop");
	});

	it("surfaces ids from the run that actually landed", () => {
		interface WithIds extends IntentOutcome {
			readonly createdNodeIds: readonly string[];
		}
		const first = docWith("a");
		const moved = docWith("moved");
		const api = {
			appState: { data: first },
			config: {},
			dispatch: (action: Dispatched) => {
				action.data(moved);
			},
		} as unknown as PuckApi;

		const attempt = dispatchOneIntent<WithIds>(api, (data) => ({
			data: docWith("next"),
			status: "updated",
			errors: [],
			createdNodeIds: data === moved ? ["from-retry"] : ["from-first"],
		}));

		expect(attempt.committed).toBe(true);
		// Not `from-first` — the caller must report what the document got.
		expect(attempt.outcome.createdNodeIds).toEqual(["from-retry"]);
	});

	it("fails closed when an adapter defers the functional updater", () => {
		const start = docWith("a");
		const next = docWith("b");
		let deferred: ((previous: Data) => Data) | undefined;
		const api = {
			appState: { data: start },
			config: {},
			dispatch: (action: Dispatched) => {
				deferred = action.data;
			},
		} as unknown as PuckApi;

		expect(() => dispatchOneIntent(api, alwaysUpdates(next))).toThrow(
			"Puck dispatch must apply setData functional updaters synchronously",
		);
		// The queued reducer escaped the call, but is inert: it cannot land a
		// write after the caller was told the dispatch contract was invalid.
		expect(deferred?.(start)).toBe(start);
	});
});

describe("failureStatus", () => {
	it("maps noop and rejected onto the commit-result split", () => {
		expect(
			failureStatus({ data: docWith("a"), status: "noop", errors: [] }),
		).toBe("noop");
		expect(
			failureStatus({ data: docWith("a"), status: "rejected", errors: [] }),
		).toBe("rejected");
	});
});
