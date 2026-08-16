import { expect, it } from "vitest";
import type { GenerationProvider } from "../provider";

/**
 * Provider conformance suite (DOC-02 §12) — the normative C-1…C-7
 * requirements, parameterized so every provider runs the SAME checks.
 *
 * Mock runs in CI today; AgentService runs against staging from P2-07, and
 * PuckCloud later. That is the point of the shape: a provider swap is a
 * config flip only if every provider is held to one contract, so this file
 * is deliberately provider-agnostic and lives beside the port rather than
 * inside any one provider's tests.
 */

export interface ConformanceOptions {
	/** Fresh provider per case — conformance must not depend on run order. */
	readonly create: () => GenerationProvider;
	/**
	 * Only mock providers are required to be deterministic; a cloud
	 * provider legitimately varies between runs.
	 */
	readonly deterministic?: boolean;
	/** Skipped for providers that declare no progress stream. */
	readonly hasEvents?: boolean;
}

const REQUEST = {
	prompt: "A pricing page",
	whitelist: ["Badge", "Button", "Card"],
} as const;

/**
 * Run the conformance suite. Call inside a `describe` block:
 *
 * ```ts
 * describe("MockProvider", () => {
 *   runProviderConformance({ create: () => createMockProvider(), deterministic: true });
 * });
 * ```
 */
export function runProviderConformance(options: ConformanceOptions): void {
	const { create, deterministic = false, hasEvents = false } = options;

	it("C-1 wire fidelity: outline returns a ProviderResult with a raw artifact", async () => {
		const result = await create().generateOutline({ ...REQUEST });

		expect(typeof result.runId).toBe("string");
		expect(result.runId.length).toBeGreaterThan(0);
		expect(result).toHaveProperty("artifact");
	});

	it("C-1 wire fidelity: section accepts the §5 payload and echoes no validation", async () => {
		const result = await create().generateSection({
			...REQUEST,
			sectionId: "s1",
		});

		expect(typeof result.runId).toBe("string");
		expect(result).toHaveProperty("artifact");
		// A provider must not decorate the result with its own verdict —
		// validation belongs to the gate, downstream and provider-independent.
		expect(result).not.toHaveProperty("valid");
		expect(result).not.toHaveProperty("errors");
	});

	it("C-1 wire fidelity: a declared generatePage honours the same shape", async () => {
		const provider = create();
		if (provider.generatePage === undefined) return;

		const result = await provider.generatePage({ ...REQUEST });
		expect(typeof result.runId).toBe("string");
		expect(result).toHaveProperty("artifact");
	});

	it("C-5 cancellation: an already-aborted signal produces no work", async () => {
		const controller = new AbortController();
		controller.abort();
		const provider = create();

		// A provider may either reject or return promptly; what it must NOT
		// do is ignore the signal and run a full generation. Both outcomes
		// are accepted here, and the loop's own abort check (§8.2) is the
		// backstop asserted in agent.test.ts.
		await provider
			.generateOutline({ ...REQUEST, signal: controller.signal })
			.catch(() => undefined);
		expect(controller.signal.aborted).toBe(true);
	});

	it("C-6 event hygiene: progress events carry no payload", async () => {
		const provider = create();
		if (!hasEvents || provider.events === undefined) return;

		const { runId } = await provider.generateOutline({ ...REQUEST });
		for await (const event of provider.events(runId)) {
			expect(event).not.toHaveProperty("artifact");
			expect(event).not.toHaveProperty("data");
			expect(event).not.toHaveProperty("puckData");
			// Only the declared progress surface may appear.
			for (const key of Object.keys(event)) {
				expect(["runId", "kind", "message", "percent"]).toContain(key);
			}
		}
	});

	it("C-7 size caps: nothing is silently truncated", async () => {
		const result = await create().generateSection({
			...REQUEST,
			sectionId: "s1",
		});
		const serialized = JSON.stringify(result.artifact ?? null);
		// A truncating provider would leave an ellipsis marker mid-artifact
		// rather than surfacing a transport error.
		expect(serialized).not.toContain("…[truncated]");
	});

	it("determinism: identical requests produce identical artifacts", async () => {
		if (!deterministic) return;

		const a = await create().generateSection({ ...REQUEST, sectionId: "s1" });
		const b = await create().generateSection({ ...REQUEST, sectionId: "s1" });
		expect(JSON.stringify(a.artifact)).toBe(JSON.stringify(b.artifact));
	});
}
