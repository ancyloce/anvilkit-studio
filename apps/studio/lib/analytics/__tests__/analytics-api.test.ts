import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ingestAnalyticsEvents } from "../analytics-api";
import {
	clearAnalyticsEvents,
	getRecordedAnalyticsEvents,
	getRecordedAnalyticsEventsByName,
} from "../store";
import type { TrackEvent } from "../types";

function event(overrides: Partial<TrackEvent> = {}): TrackEvent {
	return {
		event_name: "page_view",
		version: "1.0.0",
		timestamp: 1,
		session_id: "sess-1",
		source: "published_site",
		properties: { path: "/", slug: "", preview: false },
		...overrides,
	};
}

beforeEach(() => clearAnalyticsEvents());
afterEach(() => clearAnalyticsEvents());

describe("ingestAnalyticsEvents", () => {
	it("accepts a batch and reports the accepted count + persists them", () => {
		const result = ingestAnalyticsEvents(
			{
				events: [
					event(),
					event({ event_name: "page_published", source: "studio" }),
				],
				meta: { source: "studio", truncate_ip: true, retention_days: 90 },
			},
			1_000,
		);
		expect(result.status).toBe(200);
		expect(result.body).toEqual({ ok: true, accepted: 2 });
		const stored = getRecordedAnalyticsEvents();
		expect(stored).toHaveLength(2);
		// Server receive time is stamped on persisted events.
		expect(stored[0]?.received_at).toBe(1_000);
	});

	it("rejects an invalid batch with 400 + structured issues and persists nothing", () => {
		const result = ingestAnalyticsEvents(
			{ events: [event({ event_name: "not_allowed" })] },
			1_000,
		);
		expect(result.status).toBe(400);
		expect(result.body.ok).toBe(false);
		if (!result.body.ok) {
			expect(typeof result.body.message).toBe("string");
			expect(result.body.issues?.length).toBeGreaterThan(0);
		}
		expect(getRecordedAnalyticsEvents()).toHaveLength(0);
	});

	it("rejects a non-array events payload", () => {
		const result = ingestAnalyticsEvents({ events: {} }, 1_000);
		expect(result.status).toBe(400);
		expect(getRecordedAnalyticsEvents()).toHaveLength(0);
	});

	it("records events queryable by name", () => {
		ingestAnalyticsEvents(
			{ events: [event({ event_name: "page_published", source: "studio" })] },
			1_000,
		);
		expect(getRecordedAnalyticsEventsByName("page_published")).toHaveLength(1);
		expect(getRecordedAnalyticsEventsByName("page_view")).toHaveLength(0);
	});

	it("attaches server enrichment (user_agent + ip_hash) to stored events", () => {
		ingestAnalyticsEvents({ events: [event()] }, 1_000, {
			user_agent: "Mozilla/5.0 (Test)",
			ip_hash: "deadbeef",
		});
		const [stored] = getRecordedAnalyticsEvents();
		expect(stored?.user_agent).toBe("Mozilla/5.0 (Test)");
		expect(stored?.ip_hash).toBe("deadbeef");
	});

	it("omits enrichment fields when none is provided (default arg)", () => {
		ingestAnalyticsEvents({ events: [event()] }, 1_000);
		const [stored] = getRecordedAnalyticsEvents();
		expect(stored?.user_agent).toBeUndefined();
		expect(stored?.ip_hash).toBeUndefined();
	});
});
