/**
 * P0-20 acceptance (plan 0036): a mock prompt produces a gated page that is
 * committed once, and a gate failure leaves the document untouched. The
 * commit itself belongs to the copilot plugin ("one user intent = at most
 * ONE history-recording setData"), so this covers the seam this app owns:
 * provider → copilot callback → gate.
 */
import { describe, expect, it, vi } from "vitest";
import { componentEditorConfig } from "../editor-config";
import {
	COPILOT_DEFAULT_TIMEOUT_MS,
	createCopilotGenerators,
	whitelistOf,
} from "../generation/copilot-wiring";
import { createMockProvider } from "../generation/mock-provider";
import type { GenerationProvider } from "../generation/provider";

/** The copilot passes a context whose components are the AI whitelist. */
const ctxWith = (components: unknown) =>
	({ components }) as unknown as Parameters<
		ReturnType<typeof createCopilotGenerators>["generatePage"]
	>[1];

describe("copilot ← provider wiring (P0-20)", () => {
	it("derives the whitelist from the copilot context, whatever its shape", () => {
		expect(whitelistOf(ctxWith({ Badge: {}, Card: {} }))).toEqual([
			"Badge",
			"Card",
		]);
		expect(whitelistOf(ctxWith(["Badge", "Card"]))).toEqual(["Badge", "Card"]);
		expect(whitelistOf(ctxWith([{ type: "Badge" }, { type: "Card" }]))).toEqual(
			["Badge", "Card"],
		);
		expect(whitelistOf(ctxWith(undefined))).toEqual([]);
	});

	it("passes the whitelist to the provider and returns its artifact", async () => {
		const artifact = { version: 1, nodes: [] };
		const provider: GenerationProvider = {
			id: "mock",
			generateOutline: vi.fn(),
			generateSection: vi.fn(),
			generatePage: vi.fn(async () => ({ runId: "r1", artifact })),
		};
		const { generatePage } = createCopilotGenerators(provider);

		const result = await generatePage("a pricing page", ctxWith({ Badge: {} }));

		expect(result).toBe(artifact);
		expect(provider.generatePage).toHaveBeenCalledWith({
			prompt: "a pricing page",
			whitelist: ["Badge"],
		});
	});

	it("falls back to generateSection when a provider has no page flow", async () => {
		const provider: GenerationProvider = {
			id: "mock",
			generateOutline: vi.fn(),
			generateSection: vi.fn(async () => ({ runId: "r2", artifact: { a: 1 } })),
		};
		const { generatePage } = createCopilotGenerators(provider);
		await generatePage("hello", ctxWith({ Card: {} }));
		expect(provider.generateSection).toHaveBeenCalledWith({
			prompt: "hello",
			whitelist: ["Card"],
			sectionId: "page",
		});
	});

	it("produces an artifact from the real mock provider", async () => {
		const { generatePage } = createCopilotGenerators(createMockProvider());
		const whitelist = Object.keys(componentEditorConfig.components);
		const result = await generatePage("a landing page", ctxWith(whitelist));
		expect(result).toBeDefined();
	});

	it("surfaces a provider failure instead of committing anything", async () => {
		const provider: GenerationProvider = {
			id: "mock",
			generateOutline: vi.fn(),
			generateSection: vi.fn(),
			generatePage: vi.fn(async () => {
				throw new Error("provider exploded");
			}),
		};
		const { generatePage } = createCopilotGenerators(provider);
		// The copilot catches this and raises GENERATE_FAILED; the document
		// is never touched because nothing here dispatches.
		await expect(generatePage("x", ctxWith({}))).rejects.toThrow(
			"provider exploded",
		);
	});

	it("records the copilot's default timeout as a wiring hazard", () => {
		// DOC-02 §8.3: a provider slower than this surfaces as a copilot
		// timeout, not a provider error.
		expect(COPILOT_DEFAULT_TIMEOUT_MS).toBe(30_000);
	});
});
