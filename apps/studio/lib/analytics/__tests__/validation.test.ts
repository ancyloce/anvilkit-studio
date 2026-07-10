import { describe, expect, it } from "vitest";
import type { TrackEvent } from "../types";
import { validateAnalyticsIngest } from "../validation";

/** A minimal valid event envelope; override per case. */
function event(overrides: Partial<TrackEvent> = {}): TrackEvent {
	return {
		event_name: "page_published",
		version: "1.0.0",
		timestamp: 1,
		session_id: "sess-1",
		source: "studio",
		properties: { status_change: "published" },
		...overrides,
	};
}

describe("validateAnalyticsIngest — happy path", () => {
	it("accepts a batch of valid events", () => {
		const result = validateAnalyticsIngest({
			events: [event(), event({ event_name: "draft_saved", source: "studio" })],
			meta: { source: "studio", truncate_ip: true, retention_days: 90 },
		});
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.events).toHaveLength(2);
	});

	it("accepts the published_site source and a page_view event", () => {
		const result = validateAnalyticsIngest({
			events: [
				event({
					event_name: "page_view",
					source: "published_site",
					properties: { path: "/about", slug: "about", preview: false },
				}),
			],
		});
		expect(result.ok).toBe(true);
	});

	it("accepts an internal $-prefixed adapter event ($identify)", () => {
		const result = validateAnalyticsIngest({
			events: [
				event({ event_name: "$identify", properties: { user_id: "u1" } }),
			],
		});
		expect(result.ok).toBe(true);
	});

	it("accepts an event with no properties", () => {
		const result = validateAnalyticsIngest({
			events: [
				event({ properties: undefined as unknown as TrackEvent["properties"] }),
			],
		});
		expect(result.ok).toBe(true);
	});
});

describe("validateAnalyticsIngest — structural rejections", () => {
	it("rejects when events is not an array", () => {
		const result = validateAnalyticsIngest({ events: "nope" });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toMatch(/array/i);
	});

	it("rejects a non-object body", () => {
		expect(validateAnalyticsIngest(null).ok).toBe(false);
		expect(validateAnalyticsIngest(42).ok).toBe(false);
	});
});

describe("validateAnalyticsIngest — event-name + source rules", () => {
	it("rejects an unknown event_name", () => {
		const result = validateAnalyticsIngest({
			events: [event({ event_name: "totally_made_up" })],
		});
		expect(result.ok).toBe(false);
		if (!result.ok)
			expect(result.issues.some((i) => i.field === "event_name")).toBe(true);
	});

	it("rejects an invalid source", () => {
		const result = validateAnalyticsIngest({
			events: [
				event({ source: "marketing_site" as unknown as TrackEvent["source"] }),
			],
		});
		expect(result.ok).toBe(false);
		if (!result.ok)
			expect(result.issues.some((i) => i.field === "source")).toBe(true);
	});
});

describe("validateAnalyticsIngest — privacy boundary", () => {
	it("rejects non-primitive property values (nested object)", () => {
		const result = validateAnalyticsIngest({
			events: [
				event({
					properties: {
						// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid input.
						nested: { leak: true } as any,
					},
				}),
			],
		});
		expect(result.ok).toBe(false);
		if (!result.ok)
			expect(result.issues.some((i) => i.field === "properties.nested")).toBe(
				true,
			);
	});

	it("rejects array property values", () => {
		const result = validateAnalyticsIngest({
			events: [
				event({
					// biome-ignore lint/suspicious/noExplicitAny: deliberately invalid input.
					properties: { tags: ["a", "b"] as any },
				}),
			],
		});
		expect(result.ok).toBe(false);
	});

	it("rejects forbidden heavy/sensitive fields in properties", () => {
		for (const key of [
			"data",
			"html",
			"dom",
			"root",
			"rootProps",
			"puckData",
			"serializedHtml",
		]) {
			const result = validateAnalyticsIngest({
				events: [event({ properties: { [key]: "x" } })],
			});
			expect(result.ok, `forbidden property ${key} must be rejected`).toBe(
				false,
			);
		}
	});

	it("rejects forbidden fields placed at the top level of the event", () => {
		const result = validateAnalyticsIngest({
			events: [{ ...event(), html: "<h1>leak</h1>" }],
		});
		expect(result.ok).toBe(false);
		if (!result.ok)
			expect(result.issues.some((i) => i.field === "html")).toBe(true);
	});

	it("rejects the whole batch if any one event is invalid", () => {
		const result = validateAnalyticsIngest({
			events: [event(), event({ event_name: "bogus" })],
		});
		expect(result.ok).toBe(false);
	});
});
