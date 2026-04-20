/**
 * Code-block extraction harness for the AI integration guide
 * (`apps/docs/src/content/docs/guides/ai-integration.mdx`).
 *
 * Each `describe(...)` maps to one numbered section of the guide.
 * Snippets mirror the code blocks verbatim where possible; real
 * LLM calls are mocked via `vi.stubGlobal("fetch", …)` so CI never
 * hits a provider. If the contract drifts (types, function
 * signatures, validator behavior), these tests fail before the docs
 * ship.
 *
 * Phase 4 task: `phase4-010`.
 */
import type { PageIR } from "@anvilkit/core/types";
import type { GeneratePageFn } from "@anvilkit/plugin-ai-copilot";
import { validateAiOutput } from "@anvilkit/validator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const validHero: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{ id: "hero-1", type: "Hero", props: { title: "Hello" } },
		],
	},
	assets: [],
	metadata: {},
};

const ctxStub = {
	availableComponents: [
		{
			componentName: "Hero",
			description: "A marketing hero block with a headline and body.",
			fields: [
				{
					fieldName: "title",
					description: "Headline.",
					type: "string" as const,
				},
			],
		},
	],
};

beforeEach(() => {
	vi.unstubAllGlobals();
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// §2 — The generatePage contract
// ---------------------------------------------------------------------------

describe("§2 — generatePage contract", () => {
	const noopGeneratePage: GeneratePageFn = async (prompt, _ctx) => ({
		version: "1",
		root: {
			id: "root",
			type: "__root__",
			props: {},
			children: [
				{
					id: "hero-1",
					type: "Hero",
					props: { headline: prompt.slice(0, 80) },
				},
			],
		},
		assets: [],
		metadata: {},
	});

	it("resolves to a PageIR candidate", async () => {
		const ir = await noopGeneratePage("Build a landing page", ctxStub);
		expect(ir.version).toBe("1");
		expect(ir.root.type).toBe("__root__");
	});

	it("is called with exactly (prompt, ctx) — no extra args", async () => {
		const spy = vi.fn(noopGeneratePage);
		await spy("x", ctxStub);
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy.mock.calls[0]).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// §4 — Validator boundary
// ---------------------------------------------------------------------------

describe("§4 — validator boundary", () => {
	it("accepts a valid IR referencing declared components", () => {
		const result = validateAiOutput(validHero, ctxStub.availableComponents);
		expect(result.valid).toBe(true);
	});

	it("rejects an undeclared component type", () => {
		const evil: PageIR = {
			...validHero,
			root: {
				...validHero.root,
				children: [
					{ id: "x", type: "NotDeclared", props: {} },
				],
			},
		};
		const result = validateAiOutput(evil, ctxStub.availableComponents);
		expect(result.valid).toBe(false);
		expect(result.issues?.length ?? 0).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// §7 — Three worked adapters (mocked transport)
// ---------------------------------------------------------------------------

describe("§7 — Anthropic adapter (mocked)", () => {
	it("length-caps the prompt and returns parsed JSON", async () => {
		const anthropic = {
			messages: {
				create: vi.fn().mockResolvedValue({
					content: [{ type: "text", text: JSON.stringify(validHero) }],
				}),
			},
		};
		const generatePage: GeneratePageFn = async (prompt, ctx) => {
			if (prompt.length > 4_000) throw new Error("Prompt too long");
			const response = await anthropic.messages.create({
				model: "claude-sonnet-4-6",
				max_tokens: 4_096,
				system:
					"You are a page generator. Return ONLY a JSON PageIR. " +
					"Allowed component types: " +
					ctx.availableComponents.map((c) => c.componentName).join(", "),
				messages: [{ role: "user", content: prompt }],
			});
			const block = response.content[0];
			if (block?.type !== "text") throw new Error("No text block");
			return JSON.parse(block.text);
		};

		const ir = await generatePage("Build a landing page", ctxStub);
		expect(ir.root.type).toBe("__root__");
		expect(anthropic.messages.create).toHaveBeenCalledTimes(1);

		await expect(generatePage("x".repeat(5_000), ctxStub)).rejects.toThrow(
			"Prompt too long",
		);
	});
});

describe("§7 — OpenAI adapter (mocked)", () => {
	it("uses response_format=json_object and parses the body", async () => {
		const openai = {
			chat: {
				completions: {
					create: vi.fn().mockResolvedValue({
						choices: [
							{ message: { content: JSON.stringify(validHero) } },
						],
					}),
				},
			},
		};
		const generatePage: GeneratePageFn = async (prompt, ctx) => {
			if (prompt.length > 4_000) throw new Error("Prompt too long");
			const response = await openai.chat.completions.create({
				model: "gpt-5",
				response_format: { type: "json_object" },
				messages: [
					{
						role: "system",
						content:
							"Return JSON PageIR only. Components: " +
							ctx.availableComponents.map((c) => c.componentName).join(", "),
					},
					{ role: "user", content: prompt },
				],
			});
			const text = response.choices[0]?.message?.content;
			if (!text) throw new Error("Empty OpenAI response");
			return JSON.parse(text);
		};

		const ir = await generatePage("hello", ctxStub);
		expect(ir.root.type).toBe("__root__");
		expect(openai.chat.completions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				response_format: { type: "json_object" },
			}),
		);
	});
});

describe("§7 — generic fetch adapter", () => {
	it("POSTs to the endpoint with prompt + component allow-list", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify(validHero), { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchMock);

		function createFetchGeneratePage(endpoint: string): GeneratePageFn {
			return async (prompt, ctx) => {
				if (prompt.length > 4_000) throw new Error("Prompt too long");
				const response = await fetch(endpoint, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						prompt,
						availableComponents: ctx.availableComponents.map((c) => c.componentName),
					}),
				});
				if (!response.ok) {
					throw new Error(`AI endpoint returned ${response.status}`);
				}
				return (await response.json()) as Awaited<ReturnType<GeneratePageFn>>;
			};
		}

		const generatePage = createFetchGeneratePage("/api/ai/generate-page");
		const ir = await generatePage("hello", ctxStub);
		expect(ir.root.type).toBe("__root__");
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/ai/generate-page",
			expect.objectContaining({
				method: "POST",
				headers: { "content-type": "application/json" },
			}),
		);
		const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
		expect(body.prompt).toBe("hello");
		expect(body.availableComponents).toEqual(["Hero"]);
	});

	it("surfaces a non-2xx response as a thrown error (→ GENERATE_FAILED)", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response("", { status: 500 }),
		);
		vi.stubGlobal("fetch", fetchMock);

		function createFetchGeneratePage(endpoint: string): GeneratePageFn {
			return async (prompt, _ctx) => {
				const response = await fetch(endpoint, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ prompt }),
				});
				if (!response.ok) {
					throw new Error(`AI endpoint returned ${response.status}`);
				}
				return (await response.json()) as PageIR;
			};
		}

		const generatePage = createFetchGeneratePage("/api/ai/generate-page");
		await expect(generatePage("hello", ctxStub)).rejects.toThrow(
			"AI endpoint returned 500",
		);
	});
});
