import { describe, expect, it } from "vitest";
import { forwardable, relay } from "../agent/platform";

describe("agent proxy relay", () => {
	it("forwards Retry-After with the content type and the source headers, nothing else", () => {
		const upstream = new Response(
			JSON.stringify({
				error: {
					code: "CAPACITY_EXHAUSTED",
					message: "busy",
					requestId: "r1",
					retryable: true,
				},
			}),
			{
				status: 429,
				headers: {
					"content-type": "application/json",
					"retry-after": "3",
					"anvilkit-source-digest": `sha256:${"b".repeat(64)}`,
					authorization: "Bearer never",
					"set-cookie": "a=b",
				},
			},
		);
		const out = relay(upstream);
		expect(out.status).toBe(429);
		expect(out.headers.get("retry-after")).toBe("3");
		expect(out.headers.get("content-type")).toBe("application/json");
		expect(out.headers.get("anvilkit-source-digest")).toBe(
			`sha256:${"b".repeat(64)}`,
		);
		expect(out.headers.get("cache-control")).toBe("no-store");
		expect(out.headers.get("authorization")).toBeNull();
		expect(out.headers.get("set-cookie")).toBeNull();
	});

	it("still forwards the operation routes the generation view uses", () => {
		expect(forwardable("operations", "POST")).toBe(true);
		expect(forwardable("operations/op_1/events", "GET")).toBe(true);
		expect(forwardable("operations/op_1/source", "GET")).toBe(true);
		expect(forwardable("operations/op_1/events", "POST")).toBe(false);
	});
});
