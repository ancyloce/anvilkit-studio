import type {
	AnalyticsAdapter,
	AnalyticsEventName,
} from "@anvilkit/analytics-core";
import { describe, expect, it, vi } from "vitest";

// M1: the three Studio-owned event names this module emits must stay members of
// the analytics catalog. The `satisfies` makes a typo or a catalog rename a
// compile error here, mirroring the per-call-site `satisfies` in the emitters.
const STUDIO_EVENT_NAMES = [
	"draft_saved",
	"page_published",
	"component_dropped",
] as const satisfies readonly AnalyticsEventName[];

import {
	trackComponentDropped,
	trackDraftSaved,
	trackPagePublished,
} from "./analytics-events.js";

function spyAdapter(): AnalyticsAdapter {
	return {
		track: vi.fn(),
		identify: vi.fn(),
		flush: vi.fn(() => Promise.resolve()),
		updatePrivacyStatus: vi.fn(),
	};
}

const onlyPrimitives = (props: Record<string, unknown>): boolean =>
	Object.values(props).every(
		(v) =>
			typeof v === "string" || typeof v === "number" || typeof v === "boolean",
	);

describe("trackDraftSaved", () => {
	it("emits draft_saved with only component_count + duration_ms", () => {
		const a = spyAdapter();
		trackDraftSaved(a, 3, 42);
		expect(a.track).toHaveBeenCalledWith("draft_saved", {
			component_count: 3,
			duration_ms: 42,
		});
		const props = (a.track as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
		expect(onlyPrimitives(props)).toBe(true);
	});
});

describe("trackPagePublished", () => {
	it("emits page_published with only status_change", () => {
		const a = spyAdapter();
		trackPagePublished(a, "published");
		expect(a.track).toHaveBeenCalledWith("page_published", {
			status_change: "published",
		});
	});
});

describe("trackComponentDropped", () => {
	it("emits component_dropped on insert with component_type + zone", () => {
		const a = spyAdapter();
		trackComponentDropped(a, {
			type: "insert",
			componentType: "Hero",
			destinationZone: "root:default-zone",
		});
		expect(a.track).toHaveBeenCalledWith("component_dropped", {
			component_type: "Hero",
			zone: "root:default-zone",
		});
	});

	it("ignores non-insert actions", () => {
		const a = spyAdapter();
		trackComponentDropped(a, { type: "move" });
		trackComponentDropped(a, { type: "remove" });
		expect(a.track).not.toHaveBeenCalled();
	});

	it("falls back to safe defaults when fields are absent", () => {
		const a = spyAdapter();
		trackComponentDropped(a, { type: "insert" });
		expect(a.track).toHaveBeenCalledWith("component_dropped", {
			component_type: "unknown",
			zone: "default",
		});
	});
});

describe("no adapter", () => {
	it("is a no-op (no throw) when analytics is undefined", () => {
		expect(() => trackDraftSaved(undefined, 1, 1)).not.toThrow();
		expect(() => trackPagePublished(undefined, "x")).not.toThrow();
		expect(() =>
			trackComponentDropped(undefined, { type: "insert" }),
		).not.toThrow();
	});
});

describe("event-name catalog contract", () => {
	it("emits only names declared in the analytics catalog", () => {
		// Compile-time enforcement is the `satisfies` on STUDIO_EVENT_NAMES above;
		// this runtime check documents the contract and pins the exact set.
		expect(STUDIO_EVENT_NAMES).toEqual([
			"draft_saved",
			"page_published",
			"component_dropped",
		]);
	});
});
