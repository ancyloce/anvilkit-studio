/**
 * @file Published-page analytics aggregation tests. Covers views, unique
 * visitors, sessions, top referrers, views-by-day, preview exclusion, the
 * slug / pageId / range filters, and the `toPublishedRecord` projection.
 */

import { describe, expect, it } from "vitest";
import { aggregatePageStats, parseRangeMs, toPublishedRecord } from "../stats";
import type { StoredAnalyticsEvent } from "../types";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-06-29T12:00:00.000Z");
const day = (iso: string): number => Date.parse(`${iso}T10:00:00.000Z`);

/** A published `page_view` fixture; override per case. */
function pv(
	overrides: Partial<StoredAnalyticsEvent> = {},
): StoredAnalyticsEvent {
	const props = overrides.properties;
	return {
		event_name: "page_view",
		version: "1.0.0",
		timestamp: NOW,
		session_id: "envelope-sess",
		source: "published_site",
		received_at: NOW,
		...overrides,
		properties: {
			slug: "about",
			path: "/about",
			referrer: "https://google.com",
			preview: false,
			visitor_id: "anon_a",
			session_id: "sess_1",
			...props,
		},
	};
}

describe("aggregatePageStats — core metrics", () => {
	it("counts views, unique visitors, and sessions", () => {
		const events = [
			pv({ properties: { visitor_id: "anon_a", session_id: "sess_1" } }),
			pv({ properties: { visitor_id: "anon_a", session_id: "sess_1" } }),
			pv({ properties: { visitor_id: "anon_b", session_id: "sess_2" } }),
		];
		const stats = aggregatePageStats(events, {
			slug: "about",
			range: "7d",
			now: NOW,
		});
		expect(stats.views).toBe(3);
		expect(stats.uniqueVisitors).toBe(2); // anon_a, anon_b
		expect(stats.sessions).toBe(2); // sess_1, sess_2
		expect(stats.slug).toBe("about");
		expect(stats.range).toBe("7d");
	});

	it("uses the persistent session id from properties, not the envelope", () => {
		const events = [
			pv({ session_id: "env-x", properties: { session_id: "sess_1" } }),
			pv({ session_id: "env-y", properties: { session_id: "sess_1" } }),
		];
		const stats = aggregatePageStats(events, { now: NOW });
		expect(stats.sessions).toBe(1); // both share persistent sess_1
	});

	it("groups top referrers, bucketing empty referrer as (direct), sorted desc", () => {
		const events = [
			pv({ properties: { referrer: "https://google.com" } }),
			pv({ properties: { referrer: "https://google.com" } }),
			pv({ properties: { referrer: "https://twitter.com" } }),
			pv({ properties: { referrer: "" } }),
		];
		const stats = aggregatePageStats(events, { now: NOW });
		expect(stats.topReferrers).toEqual([
			{ referrer: "https://google.com", count: 2 },
			{ referrer: "(direct)", count: 1 },
			{ referrer: "https://twitter.com", count: 1 },
		]);
	});

	it("groups views by UTC day, sorted ascending", () => {
		const events = [
			pv({ timestamp: day("2026-06-27") }),
			pv({ timestamp: day("2026-06-29") }),
			pv({ timestamp: day("2026-06-29") }),
		];
		const stats = aggregatePageStats(events, { range: "30d", now: NOW });
		expect(stats.viewsByDay).toEqual([
			{ date: "2026-06-27", views: 1 },
			{ date: "2026-06-29", views: 2 },
		]);
	});
});

describe("aggregatePageStats — filtering / privacy", () => {
	it("excludes preview page views entirely", () => {
		const events = [
			pv({ properties: { preview: false, visitor_id: "anon_a" } }),
			pv({ properties: { preview: true, visitor_id: "anon_b" } }),
		];
		const stats = aggregatePageStats(events, { now: NOW });
		expect(stats.views).toBe(1);
		expect(stats.uniqueVisitors).toBe(1);
	});

	it("excludes non-page_view events and studio-source events", () => {
		const events = [
			pv(),
			pv({ event_name: "page_published", source: "studio" }),
			pv({ event_name: "draft_saved", source: "studio" }),
			// A studio-sourced page_view (editor) must not count as published traffic.
			pv({ source: "studio" }),
		];
		const stats = aggregatePageStats(events, { now: NOW });
		expect(stats.views).toBe(1);
	});

	it("filters by slug", () => {
		const events = [
			pv({ properties: { slug: "about" } }),
			pv({ properties: { slug: "pricing" } }),
		];
		expect(aggregatePageStats(events, { slug: "about", now: NOW }).views).toBe(
			1,
		);
		expect(
			aggregatePageStats(events, { slug: "pricing", now: NOW }).views,
		).toBe(1);
		expect(
			aggregatePageStats(events, { slug: "missing", now: NOW }).views,
		).toBe(0);
	});

	it("filters by pageId (envelope page_id)", () => {
		const events = [
			pv({ page_id: "p1" }),
			pv({ page_id: "p2" }),
			pv({ page_id: "p1" }),
		];
		const stats = aggregatePageStats(events, { pageId: "p1", now: NOW });
		expect(stats.views).toBe(2);
		expect(stats.pageId).toBe("p1");
	});

	it("excludes events outside the time range", () => {
		const events = [
			pv({ timestamp: NOW }),
			pv({ timestamp: NOW - 2 * DAY }),
			pv({ timestamp: NOW - 10 * DAY }), // outside 7d
		];
		expect(aggregatePageStats(events, { range: "7d", now: NOW }).views).toBe(2);
		expect(aggregatePageStats(events, { range: "all", now: NOW }).views).toBe(
			3,
		);
	});
});

describe("parseRangeMs", () => {
	it("parses h/d tokens, all, and defaults", () => {
		expect(parseRangeMs("24h")).toBe(24 * 60 * 60 * 1000);
		expect(parseRangeMs("7d")).toBe(7 * DAY);
		expect(parseRangeMs("30d")).toBe(30 * DAY);
		expect(parseRangeMs("all")).toBeNull();
		expect(parseRangeMs(undefined)).toBe(7 * DAY);
		expect(parseRangeMs("garbage")).toBe(7 * DAY);
	});
});

describe("toPublishedRecord", () => {
	it("projects envelope + properties into the logical record", () => {
		const event = pv({
			page_id: "p1",
			session_id: "env-x",
			user_agent: "Mozilla/5.0",
			ip_hash: "abc123",
			properties: {
				slug: "about",
				path: "/about",
				referrer: "https://google.com",
				visitor_id: "anon_a",
				session_id: "sess_1",
				preview: false,
			},
		});
		const record = toPublishedRecord(event);
		expect(record).toMatchObject({
			eventName: "page_view",
			source: "published_site",
			pageId: "p1",
			slug: "about",
			path: "/about",
			referrer: "https://google.com",
			sessionId: "sess_1", // persistent session preferred over envelope
			visitorId: "anon_a",
			userAgent: "Mozilla/5.0",
			ipHash: "abc123",
		});
		expect(record.timestamp).toBe(new Date(NOW).toISOString());
	});
});
