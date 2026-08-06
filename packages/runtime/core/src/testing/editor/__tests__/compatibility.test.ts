/**
 * The "reader only" compatibility suite (PLAN-0020 CORE-P0-017;
 * DD-0019 §30.7 rollout stage 1): with editor code present but
 * disabled, every legacy fixture loads unchanged, unknown versions
 * stay read-only with raw data preserved verbatim, and the fixture
 * builders themselves produce schema-valid documents.
 */

import { safeParseAuthoringState } from "@anvilkit/schema/editor";
import { describe, expect, it } from "vitest";
import {
	createEmptyAuthoringState,
	readAuthoringState,
	writeAuthoringState,
} from "../../../editor/index.js";
import {
	assertContentFreeEvent,
	buildAuthoringStateAtLimits,
	buildLegacyPuckData,
	buildPuckDataWithSidecar,
	buildRootConfigWithSlotFields,
	buildUnknownVersionSidecar,
	createHistoryRecordingProbe,
} from "../index.js";

describe("legacy documents (reader-only stage)", () => {
	it("reads a missing sidecar as empty authoring state", () => {
		const result = readAuthoringState(buildLegacyPuckData());
		expect(result.state).toEqual(createEmptyAuthoringState());
		expect(result.readOnly).toBe(false);
		expect(result.errors).toEqual([]);
	});

	it("keeps legacy root props and content intact across a write", () => {
		const legacy = buildLegacyPuckData(2);
		const written = writeAuthoringState(legacy, createEmptyAuthoringState());
		expect(written.content).toBe(legacy.content);
		const writtenProps = written.root?.props as
			| Record<string, unknown>
			| undefined;
		expect(writtenProps?.title).toBe("Legacy page");
	});

	it("preserves unknown-version sidecars verbatim and goes read-only", () => {
		const sidecar = buildUnknownVersionSidecar();
		const result = readAuthoringState(buildPuckDataWithSidecar(sidecar));
		expect(result.readOnly).toBe(true);
		expect(result.raw).toBe(sidecar);
		expect(result.errors[0]?.code).toBe("EDITOR_CONTRACT_UNSUPPORTED_VERSION");
	});

	// P6-01: config decoration was DELETED — "undecorated" is now the
	// only possible state, so the old identity assertion is structural.
});

describe("fixture builders", () => {
	it("produces schema-valid documents at reduced limits", () => {
		const state = buildAuthoringStateAtLimits({
			nodeRecords: 50,
			tokens: 100,
			styleDefinitions: 20,
			componentDefinitions: 10,
			interactions: 20,
			breakpoints: 4,
		});
		const parsed = safeParseAuthoringState(state);
		expect(
			parsed.success,
			JSON.stringify(parsed.error?.issues?.slice(0, 3)),
		).toBe(true);
		expect(Object.keys(state.nodes)).toHaveLength(50);
	});

	it("is deterministic across calls", () => {
		const a = buildAuthoringStateAtLimits({ nodeRecords: 5, tokens: 5 });
		const b = buildAuthoringStateAtLimits({ nodeRecords: 5, tokens: 5 });
		expect(a).toEqual(b);
	});

	// P6-01: the sidecar-slot collision guard lived in config
	// decoration, which was DELETED — no path inspects root slot names
	// anymore, and v2 documents carry no sidecar to collide with.
});

describe("contract assertion helpers", () => {
	it("counts history-recording dispatches and flags violations", () => {
		const probe = createHistoryRecordingProbe();
		const seen: Array<{ recordHistory?: boolean }> = [];
		const dispatch = probe.wrap((action) => seen.push(action));
		dispatch({ recordHistory: true });
		dispatch({});
		expect(probe.count()).toBe(1);
		expect(() => probe.assertSingleIntent()).not.toThrow();
		dispatch({ recordHistory: true });
		expect(() => probe.assertSingleIntent()).toThrow(/single-intent/);
		probe.reset();
		expect(probe.count()).toBe(0);
		expect(seen).toHaveLength(3);
	});

	it("accepts content-free events and rejects leaky ones", () => {
		expect(() =>
			assertContentFreeEvent({
				type: "command.committed",
				commandType: "node.layout.set",
				source: "inspector",
				durationMs: 4,
				changedNodeCount: 2,
			}),
		).not.toThrow();
		expect(() =>
			assertContentFreeEvent({
				type: "command.rejected",
				commandType: "node.layout.set",
				errorCodes: ["EDITOR_NODE_LOCKED"],
				// @ts-expect-error deliberately leaky payload
				propValue: "secret",
			}),
		).toThrow(/undeclared key/);
		expect(() =>
			assertContentFreeEvent({
				type: "gesture.completed",
				gesture: "https://leaky.example/url",
				durationMs: 1,
			}),
		).toThrow(/URL/);
	});
});
