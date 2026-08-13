/**
 * @file Regression tests for review 0036 M-3 — ids must be unique on an
 * insecure origin.
 *
 * `crypto.randomUUID()` is secure-context-only, so on a plain-HTTP
 * origin that is not `localhost` it is `undefined`. The old
 * `generateNodeId` fell back to `Date.now().toString(36)` — millisecond
 * resolution — and `cloneSubtree` calls it in a tight synchronous loop,
 * so every node in a duplicated subtree got the SAME id. Thirteen other
 * sites called `crypto.randomUUID()` unguarded and threw outright in the
 * same environment.
 *
 * These tests stub the global `crypto` to reproduce each environment,
 * because that is the only thing that distinguishes them.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { generateNodeId, randomId } from "../node-id.js";

const realCrypto = globalThis.crypto;

/** Swap the global Web Crypto object for the duration of a test. */
function withCrypto(replacement: Partial<Crypto> | undefined): void {
	Object.defineProperty(globalThis, "crypto", {
		value: replacement,
		configurable: true,
		writable: true,
	});
}

afterEach(() => {
	withCrypto(realCrypto);
	vi.restoreAllMocks();
});

const UUID_SHAPE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("generateNodeId — insecure origins (0036 M-3)", () => {
	it("is unique in a tight loop on a secure origin", () => {
		const ids = Array.from({ length: 500 }, () => generateNodeId("Hero"));
		expect(new Set(ids).size).toBe(500);
	});

	it("is unique in a tight loop WITHOUT randomUUID", () => {
		// Exactly an insecure origin: `getRandomValues` is present (it is not
		// secure-context-gated), `randomUUID` is not.
		withCrypto({
			getRandomValues: realCrypto.getRandomValues.bind(realCrypto),
		});

		// The `cloneSubtree` shape: many ids inside one millisecond. Before
		// the fix every one of these was identical.
		const ids = Array.from({ length: 500 }, () => generateNodeId("Hero"));
		expect(new Set(ids).size).toBe(500);
	});

	it("is unique in a tight loop with NO Web Crypto at all", () => {
		withCrypto(undefined);
		const ids = Array.from({ length: 500 }, () => generateNodeId("Hero"));
		expect(new Set(ids).size).toBe(500);
	});

	it("keeps the readable component prefix", () => {
		expect(generateNodeId("Hero")).toMatch(/^Hero-[0-9a-f]{8}$/);
		withCrypto({
			getRandomValues: realCrypto.getRandomValues.bind(realCrypto),
		});
		expect(generateNodeId("Hero")).toMatch(/^Hero-[0-9a-f]{8}$/);
		withCrypto(undefined);
		expect(generateNodeId("Hero")).toMatch(/^Hero-[0-9a-f]{8}$/);
	});
});

describe("randomId — never throws on an insecure origin", () => {
	it("uses randomUUID when the context allows", () => {
		const randomUUID = vi.fn(
			() => "11111111-2222-4333-8444-555555555555",
		) as unknown as Crypto["randomUUID"];
		withCrypto({ randomUUID });
		expect(randomId()).toBe("11111111-2222-4333-8444-555555555555");
	});

	it("falls back to getRandomValues rather than throwing", () => {
		// The direct `crypto.randomUUID()` call this replaced threw
		// `crypto.randomUUID is not a function` here, out of a click handler.
		withCrypto({
			getRandomValues: realCrypto.getRandomValues.bind(realCrypto),
		});
		const id = randomId();
		expect(id).toMatch(UUID_SHAPE);
		// A well-formed v4: version nibble and RFC 4122 variant.
		expect(id[14]).toBe("4");
		expect(["8", "9", "a", "b"]).toContain(id[19]);
	});

	it("still returns unique uuid-shaped ids with no Web Crypto", () => {
		withCrypto(undefined);
		const ids = Array.from({ length: 200 }, () => randomId());
		expect(new Set(ids).size).toBe(200);
		for (const id of ids) {
			expect(id).toMatch(UUID_SHAPE);
		}
	});
});
