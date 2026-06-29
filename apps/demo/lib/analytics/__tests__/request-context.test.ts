/**
 * @file Server enrichment tests: the user-agent is captured and the client IP
 * is reduced to a salted hash — the RAW IP must never appear in the output.
 */

import { describe, expect, it } from "vitest";
import { deriveServerEnrichment, hashIp } from "../request-context";

function request(headers: Record<string, string>): Request {
	return new Request("https://demo.test/api/analytics/events", {
		method: "POST",
		headers,
	});
}

describe("hashIp", () => {
	it("is deterministic for a fixed salt and never echoes the raw IP", () => {
		const a = hashIp("203.0.113.7", "salt");
		const b = hashIp("203.0.113.7", "salt");
		expect(a).toBe(b);
		expect(a).not.toContain("203.0.113.7");
		expect(a).toMatch(/^[a-f0-9]{32}$/);
	});

	it("produces different hashes for different salts (no cross-deploy correlation)", () => {
		expect(hashIp("203.0.113.7", "salt-1")).not.toBe(
			hashIp("203.0.113.7", "salt-2"),
		);
	});
});

describe("deriveServerEnrichment", () => {
	it("captures the user-agent and a hashed IP from x-forwarded-for", () => {
		const enrichment = deriveServerEnrichment(
			request({
				"user-agent": "Mozilla/5.0 (Test)",
				"x-forwarded-for": "203.0.113.7, 10.0.0.1",
			}),
		);
		expect(enrichment.user_agent).toBe("Mozilla/5.0 (Test)");
		expect(enrichment.ip_hash).toMatch(/^[a-f0-9]{32}$/);
		// Raw IP must never leak into the stored enrichment.
		expect(JSON.stringify(enrichment)).not.toContain("203.0.113.7");
	});

	it("falls back to x-real-ip and omits fields when headers are absent", () => {
		const withReal = deriveServerEnrichment(
			request({ "x-real-ip": "198.51.100.9" }),
		);
		expect(withReal.ip_hash).toMatch(/^[a-f0-9]{32}$/);
		expect(withReal.user_agent).toBeUndefined();

		const empty = deriveServerEnrichment(request({}));
		expect(empty.ip_hash).toBeUndefined();
		expect(empty.user_agent).toBeUndefined();
	});
});
