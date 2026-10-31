/**
 * The generation intent client (plan 0005 §4.5): one intent, one command id
 * and one canonical digest persisted before the request; a lost response
 * retries the identical body and id; a 202 stores the operation and a later
 * call returns it without posting; "Generate again" is a new intent; an
 * idempotency conflict never mints a new id by itself.
 */
import { describe, expect, it } from "vitest";
import {
	canonicalSubjectDigest,
	type CreateOperationRequest,
	generationRequest,
	type IntentStore,
	intentKey,
	loadIntent,
	startGeneration,
} from "../agent/generation-client";

function memoryStore(): IntentStore & { readonly map: Map<string, string> } {
	const map = new Map<string, string>();
	return {
		map,
		getItem: (k) => map.get(k) ?? null,
		setItem: (k, v) => void map.set(k, v),
		removeItem: (k) => void map.delete(k),
	};
}

type Answer =
	| { kind: "throw" }
	| { kind: "accepted"; operationId: string }
	| { kind: "error"; status: number; code: string; retryable: boolean };

function fakeFetch(answers: Answer[]) {
	const posts: { url: string; body: CreateOperationRequest }[] = [];
	const impl: typeof fetch = async (input, init) => {
		posts.push({
			url: String(input),
			body: JSON.parse(String(init?.body)) as CreateOperationRequest,
		});
		const a = answers.shift();
		if (!a || a.kind === "throw") throw new TypeError("lost");
		if (a.kind === "accepted") {
			return Response.json(
				{
					operationId: a.operationId,
					kind: "generation",
					lifecycle: "accepted",
				},
				{ status: 202 },
			);
		}
		return Response.json(
			{
				error: {
					code: a.code,
					message: "m",
					requestId: "r",
					retryable: a.retryable,
				},
			},
			{ status: a.status },
		);
	};
	return { posts, impl };
}

const brief = { briefId: "brf_1", preparationOperationId: "op_prep" };

describe("generation intent client", () => {
	it("computes a stable canonical digest per intent ordinal", async () => {
		const a = await canonicalSubjectDigest({ ...brief, intent: 1 });
		const b = await canonicalSubjectDigest({ ...brief, intent: 1 });
		const c = await canonicalSubjectDigest({ ...brief, intent: 2 });
		expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
		expect(a).toBe(b);
		expect(a).not.toBe(c);
		// The canonical form is {"briefId","intent","preparationOperationId"} in that order.
		expect(a).toBe(
			`sha256:${Buffer.from(
				await crypto.subtle.digest(
					"SHA-256",
					new TextEncoder().encode(
						'{"briefId":"brf_1","intent":1,"preparationOperationId":"op_prep"}',
					),
				),
			).toString("hex")}`,
		);
	});

	it("persists the intent before posting, retries a lost response with the identical body and id, then stores the operation", async () => {
		const store = memoryStore();
		const { posts, impl } = fakeFetch([
			{ kind: "throw" },
			{ kind: "accepted", operationId: "op_gen" },
		]);
		const lost = await startGeneration({ store, ...brief, fetch: impl });
		expect(lost.ok).toBe(false);
		const pending = loadIntent(store, "brf_1");
		expect(pending).toMatchObject({ briefId: "brf_1", intent: 1 });
		expect(pending?.operationId).toBeUndefined();
		const retried = await startGeneration({ store, ...brief, fetch: impl });
		expect(retried).toMatchObject({
			ok: true,
			operationId: "op_gen",
			reused: false,
		});
		expect(posts).toHaveLength(2);
		expect(posts[1]?.body).toEqual(posts[0]?.body);
		expect(posts[0]?.url).toBe("/api/agent/v1/operations");
		expect(posts[0]?.body).toEqual({
			commandId: pending?.commandId,
			kind: "generation",
			subject: {
				profileId: "generation-v1",
				briefId: "brf_1",
				subjectDigest: pending?.subjectDigest,
			},
		});
		expect(loadIntent(store, "brf_1")?.operationId).toBe("op_gen");
		// A refresh, a locale switch or a reconnect calls again without `again`: nothing is posted.
		const again = await startGeneration({ store, ...brief, fetch: impl });
		expect(again).toMatchObject({
			ok: true,
			operationId: "op_gen",
			reused: true,
		});
		expect(posts).toHaveLength(2);
	});

	it("Generate again is a new intent: new command id, new digest, new operation", async () => {
		const store = memoryStore();
		const { posts, impl } = fakeFetch([
			{ kind: "accepted", operationId: "op_a" },
			{ kind: "accepted", operationId: "op_b" },
		]);
		await startGeneration({ store, ...brief, fetch: impl });
		const second = await startGeneration({
			store,
			...brief,
			fetch: impl,
			again: true,
		});
		expect(second).toMatchObject({
			ok: true,
			operationId: "op_b",
			reused: false,
		});
		expect(posts[1]?.body.commandId).not.toBe(posts[0]?.body.commandId);
		expect(posts[1]?.body.subject.subjectDigest).not.toBe(
			posts[0]?.body.subject.subjectDigest,
		);
		expect(loadIntent(store, "brf_1")).toMatchObject({
			intent: 2,
			operationId: "op_b",
		});
	});

	it("an idempotency conflict keeps the intent (no automatic new id); another decided refusal releases it; a retryable one keeps it", async () => {
		const store = memoryStore();
		const { impl } = fakeFetch([
			{
				kind: "error",
				status: 409,
				code: "IDEMPOTENCY_CONFLICT",
				retryable: false,
			},
			{
				kind: "error",
				status: 503,
				code: "DEPENDENCY_UNAVAILABLE",
				retryable: true,
			},
			{
				kind: "error",
				status: 400,
				code: "INVALID_ARGUMENT",
				retryable: false,
			},
		]);
		const conflict = await startGeneration({ store, ...brief, fetch: impl });
		expect(conflict).toMatchObject({ ok: false, status: 409 });
		expect(loadIntent(store, "brf_1")?.commandId).toBe(
			conflict.intent.commandId,
		);
		const busy = await startGeneration({ store, ...brief, fetch: impl });
		expect(busy).toMatchObject({ ok: false, status: 503 });
		expect(loadIntent(store, "brf_1")?.commandId).toBe(
			conflict.intent.commandId,
		);
		const refused = await startGeneration({ store, ...brief, fetch: impl });
		expect(refused).toMatchObject({ ok: false, status: 400 });
		expect(loadIntent(store, "brf_1")).toBeNull();
		expect(store.map.has(intentKey("brf_1"))).toBe(false);
	});

	it("ignores a stored intent of another brief or a malformed record", () => {
		const store = memoryStore();
		store.setItem(
			intentKey("brf_1"),
			JSON.stringify({ briefId: "brf_2", intent: 1 }),
		);
		expect(loadIntent(store, "brf_1")).toBeNull();
		store.setItem(intentKey("brf_1"), "{not json");
		expect(loadIntent(store, "brf_1")).toBeNull();
		const request = generationRequest({
			...brief,
			intent: 3,
			commandId: "gen_x",
			subjectDigest: `sha256:${"0".repeat(64)}`,
		});
		expect(request.kind).toBe("generation");
	});
});
