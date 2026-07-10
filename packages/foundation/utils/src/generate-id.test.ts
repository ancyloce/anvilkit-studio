import { afterEach, describe, expect, it, vi } from "vitest";
import { generateId } from "./generate-id.js";

describe("generateId", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns a v4-shaped UUID when crypto.randomUUID is available", () => {
		const id = generateId();
		expect(id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		);
	});

	it("prepends the prefix with a dash separator", () => {
		const id = generateId("plugin");
		expect(id.startsWith("plugin-")).toBe(true);
		expect(id.slice("plugin-".length)).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		);
	});

	it("produces distinct IDs on repeated calls", () => {
		const ids = new Set(Array.from({ length: 32 }, () => generateId()));
		expect(ids.size).toBe(32);
	});

	it("delegates to crypto.randomUUID when present", () => {
		const spy = vi
			.spyOn(globalThis.crypto, "randomUUID")
			.mockReturnValue("11111111-1111-4111-8111-111111111111");
		expect(generateId()).toBe("11111111-1111-4111-8111-111111111111");
		expect(generateId("x")).toBe("x-11111111-1111-4111-8111-111111111111");
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it("falls back to a Math.random UUID when crypto.randomUUID is unavailable", () => {
		const originalCrypto = globalThis.crypto;
		// Simulate a locked-down environment (e.g. older JSDOM) by
		// replacing globalThis.crypto with an object that lacks
		// randomUUID. Restored after the assertion.
		Object.defineProperty(globalThis, "crypto", {
			configurable: true,
			value: {},
		});
		try {
			const id = generateId();
			expect(id).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
			);
			const prefixed = generateId("fallback");
			expect(prefixed.startsWith("fallback-")).toBe(true);
		} finally {
			Object.defineProperty(globalThis, "crypto", {
				configurable: true,
				value: originalCrypto,
			});
		}
	});

	it("falls back when globalThis.crypto is entirely undefined", () => {
		const originalCrypto = globalThis.crypto;
		Object.defineProperty(globalThis, "crypto", {
			configurable: true,
			value: undefined,
		});
		try {
			const id = generateId("no-crypto");
			expect(id.startsWith("no-crypto-")).toBe(true);
		} finally {
			Object.defineProperty(globalThis, "crypto", {
				configurable: true,
				value: originalCrypto,
			});
		}
	});
});
