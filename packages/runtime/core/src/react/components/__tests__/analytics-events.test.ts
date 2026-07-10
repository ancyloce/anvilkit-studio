/**
 * @file Unit tests for the `<Studio>`-owned F9 system-event emitters. Each
 * emitter is pure (adapter + lightweight args → at most one `track` call) and
 * a no-op when the adapter is `undefined`. The SEO/plugin-toggle emitters are
 * the F9 gap closed in this pass; the three originals are covered here too so
 * the forbidden-fields rule is asserted across the full catalog.
 */

import type {
	AnalyticsAdapter,
	AnalyticsEventName,
} from "@anvilkit/analytics-core";
import { describe, expect, it, vi } from "vitest";
import {
	trackComponentDropped,
	trackDraftSaved,
	trackPagePublished,
	trackPluginToggled,
	trackSeoUpdated,
} from "../analytics-events.js";

/** A spy adapter recording every `track` call's name + props. */
function spyAdapter(): AnalyticsAdapter & {
	readonly calls: { name: string; props: Record<string, unknown> }[];
} {
	const calls: { name: string; props: Record<string, unknown> }[] = [];
	return {
		calls,
		track: (name, props) => {
			calls.push({ name, props });
		},
		identify: vi.fn(),
		flush: vi.fn(() => Promise.resolve()),
		updatePrivacyStatus: vi.fn(),
	};
}

const FORBIDDEN_KEYS = ["root", "props", "content", "data", "html"];

function assertLightweight(props: Record<string, unknown>): void {
	for (const key of Object.keys(props)) {
		expect(FORBIDDEN_KEYS).not.toContain(key);
	}
	// Only primitives or arrays of primitives — never nested objects / DOM.
	for (const value of Object.values(props)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				expect(["string", "number", "boolean"]).toContain(typeof item);
			}
		} else {
			expect(["string", "number", "boolean"]).toContain(typeof value);
		}
	}
}

describe("trackSeoUpdated", () => {
	const base = { root: { props: { seo: { title: "A", noIndex: false } } } };

	it("emits the changed SEO field names only", () => {
		const a = spyAdapter();
		const next = { root: { props: { seo: { title: "B", noIndex: true } } } };
		trackSeoUpdated(a, base, next);
		expect(a.calls).toHaveLength(1);
		expect(a.calls[0]?.name).toBe("seo_updated" satisfies AnalyticsEventName);
		// Comma-joined string (not an array) so it survives the transport's
		// primitive-only `sanitizeProperties` — see emitter note.
		expect(a.calls[0]?.props.modified_fields).toBe("title,noIndex");
		assertLightweight(a.calls[0]?.props ?? {});
	});

	it("does not emit when no SEO field changed", () => {
		const a = spyAdapter();
		trackSeoUpdated(a, base, {
			root: { props: { seo: { ...base.root.props.seo } } },
		});
		expect(a.calls).toHaveLength(0);
	});

	it("does not leak the SEO values, only the field names", () => {
		const a = spyAdapter();
		const next = { root: { props: { seo: { title: "secret-value" } } } };
		trackSeoUpdated(a, { root: { props: { seo: {} } } }, next);
		expect(JSON.stringify(a.calls)).not.toContain("secret-value");
	});

	it("is a no-op without an adapter", () => {
		expect(() => trackSeoUpdated(undefined, base, base)).not.toThrow();
	});

	it("tolerates missing root/props/seo on either side", () => {
		const a = spyAdapter();
		trackSeoUpdated(a, undefined, { root: { props: { seo: { title: "X" } } } });
		expect(a.calls[0]?.props.modified_fields).toBe("title");
	});
});

describe("trackPluginToggled", () => {
	it("emits plugin_name + state on open", () => {
		const a = spyAdapter();
		trackPluginToggled(a, "seo", "opened");
		expect(a.calls).toHaveLength(1);
		expect(a.calls[0]?.name).toBe(
			"plugin_toggled" satisfies AnalyticsEventName,
		);
		expect(a.calls[0]?.props).toEqual({ plugin_name: "seo", state: "opened" });
		assertLightweight(a.calls[0]?.props ?? {});
	});

	it("emits state closed on collapse", () => {
		const a = spyAdapter();
		trackPluginToggled(a, "history", "closed");
		expect(a.calls[0]?.props).toEqual({
			plugin_name: "history",
			state: "closed",
		});
	});

	it("is a no-op without an adapter", () => {
		expect(() => trackPluginToggled(undefined, "seo", "opened")).not.toThrow();
	});
});

describe("the three original F9 emitters stay lightweight", () => {
	it("draft_saved / page_published / component_dropped forward only primitives", () => {
		const a = spyAdapter();
		trackDraftSaved(a, 3, 120);
		trackPagePublished(a, "published");
		trackComponentDropped(a, {
			type: "insert",
			componentType: "Button",
			destinationZone: "root:default-zone",
		});
		expect(a.calls.map((c) => c.name)).toEqual([
			"draft_saved",
			"page_published",
			"component_dropped",
		]);
		for (const call of a.calls) assertLightweight(call.props);
	});

	it("component_dropped ignores non-insert actions", () => {
		const a = spyAdapter();
		trackComponentDropped(a, { type: "move" });
		expect(a.calls).toHaveLength(0);
	});
});
