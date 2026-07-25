/**
 * §24.1 sidecar read/write semantics (PLAN-0020 CORE-P0-007).
 */

import type { Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
	createEmptyAuthoringState,
	readAuthoringState,
	writeAuthoringState,
} from "../index.js";

function deepFreeze<T>(value: T): T {
	if (typeof value === "object" && value !== null) {
		for (const entry of Object.values(value)) {
			deepFreeze(entry);
		}
		Object.freeze(value);
	}
	return value;
}

const emptyData = { content: [], root: { props: {} }, zones: {} } as Data;

describe("readAuthoringState", () => {
	it("returns an empty state for a missing sidecar", () => {
		const result = readAuthoringState(emptyData);
		expect(result.state).toEqual(createEmptyAuthoringState());
		expect(result.readOnly).toBe(false);
		expect(result.errors).toEqual([]);
		expect(result.raw).toBeUndefined();
	});

	it("returns an empty state when root/props are absent entirely", () => {
		const result = readAuthoringState({ content: [] } as unknown as Data);
		expect(result.readOnly).toBe(false);
		expect(result.state.revision).toBe(0);
	});

	it("preserves raw invalid sidecar data and goes read-only", () => {
		const raw = { version: "1", revision: "not-a-number" };
		const data = {
			content: [],
			root: { props: { __anvilkit: raw } },
		} as unknown as Data;
		const result = readAuthoringState(data);
		expect(result.readOnly).toBe(true);
		expect(result.raw).toBe(raw);
		expect(result.errors[0]?.code).toBe("EDITOR_CONTRACT_UNSUPPORTED_VERSION");
		expect(result.errors[0]?.details?.reason).toBe("invalid-sidecar");
		expect(result.state).toEqual(createEmptyAuthoringState());
	});

	it("classifies structurally implausible sidecar values as invalid", () => {
		const data = {
			content: [],
			root: { props: { __anvilkit: "garbage" } },
		} as unknown as Data;
		const result = readAuthoringState(data);
		expect(result.readOnly).toBe(true);
		expect(result.errors[0]?.details?.reason).toBe("invalid-sidecar");
	});

	it("goes read-only with the version error for unknown majors", () => {
		const raw = { version: "2", revision: 4, futureStuff: true };
		const data = {
			content: [],
			root: { props: { __anvilkit: raw } },
		} as unknown as Data;
		const result = readAuthoringState(data);
		expect(result.readOnly).toBe(true);
		expect(result.raw).toBe(raw);
		expect(result.errors[0]?.code).toBe("EDITOR_CONTRACT_UNSUPPORTED_VERSION");
		expect(result.errors[0]?.details?.version).toBe("2");
	});

	it("reads and normalizes a valid sidecar", () => {
		const state = {
			...createEmptyAuthoringState(),
			revision: 3,
			nodes: { ghost: { version: "1", locked: false } },
		};
		const data = {
			content: [],
			root: { props: { __anvilkit: state } },
		} as unknown as Data;
		const result = readAuthoringState(data);
		expect(result.readOnly).toBe(false);
		expect(result.state.revision).toBe(3);
		// Default-only record normalized away (invariant 3).
		expect(result.state.nodes).toEqual({});
	});
});

describe("writeAuthoringState", () => {
	it("writes a compacted sidecar without mutating the input", () => {
		const data = deepFreeze({
			content: [],
			root: { props: { title: "Page" } },
			zones: {},
		}) as unknown as Data;
		const next = {
			...createEmptyAuthoringState(),
			revision: 1,
			nodes: { empty: { version: "1" as const } },
		};
		const written = writeAuthoringState(data, next);
		const writtenProps = written.root?.props as
			| Record<string, unknown>
			| undefined;
		const sidecar = writtenProps?.__anvilkit as {
			revision: number;
			nodes: Record<string, unknown>;
		};
		expect(sidecar.revision).toBe(1);
		expect(sidecar.nodes).toEqual({});
		expect(writtenProps?.title).toBe("Page");
		const originalProps = data.root?.props as
			| Record<string, unknown>
			| undefined;
		expect(originalProps?.__anvilkit).toBeUndefined();
	});

	it("round-trips through readAuthoringState", () => {
		const next = { ...createEmptyAuthoringState(), revision: 9 };
		const written = writeAuthoringState(emptyData, next);
		const read = readAuthoringState(written);
		expect(read.readOnly).toBe(false);
		expect(read.state.revision).toBe(9);
	});
});
