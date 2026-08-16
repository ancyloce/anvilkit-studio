/**
 * PLAN-0036 P1-12 / FR-032, FR-036 — the agent loop (DOC-02 §8/§9/§11).
 *
 * The loop's job is to produce ONE artifact for the plugin to commit, so
 * these tests assert the properties that make that safe: every artifact is
 * gated, repair is bounded per artifact, exhaustion leaves the document
 * untouched, and progressive updates never become extra history entries.
 */
import { describe, expect, it, vi } from "vitest";
import { componentEditorConfig } from "../editor-config";
import {
	assemble,
	CancelledError,
	GateExhaustedError,
	type LoopEvent,
	type ProgressSink,
	renderRepairPrompt,
	runGeneration,
} from "../generation/agent";
import type {
	GenerationProvider,
	ProviderResult,
} from "../generation/provider";

const irOf = (label: string) => ({
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [{ id: "n1", type: "Badge", props: { label } }],
	},
	assets: [],
	metadata: {},
});

/** A staged provider: outline first, then one section per call. */
function stagedProvider(
	overrides: Partial<GenerationProvider> = {},
): GenerationProvider {
	return {
		id: "mock",
		generateOutline: async (): Promise<ProviderResult> => ({
			runId: "outline-1",
			artifact: {
				sections: [
					{ id: "s1", intent: "hero" },
					{ id: "s2", intent: "features" },
				],
			},
		}),
		generateSection: async (request): Promise<ProviderResult> => ({
			runId: `section-${request.sectionId}`,
			artifact: irOf(request.sectionId),
		}),
		...overrides,
	};
}

const base = { config: componentEditorConfig, prompt: "A pricing page" };

describe("runGeneration — happy path", () => {
	it("generates one section per outline entry and assembles one artifact", async () => {
		const result = await runGeneration({ ...base, provider: stagedProvider() });

		expect(result.sections).toBe(2);
		const artifact = result.artifact as { root: { children: unknown[] } };
		expect(artifact.root.children).toHaveLength(2);
	});

	it("passes the whitelist derived from the Config to the provider", async () => {
		const generateSection = vi.fn(async (request) => ({
			runId: "s",
			artifact: irOf(request.sectionId),
		}));
		await runGeneration({
			...base,
			provider: stagedProvider({ generateSection }),
		});

		const whitelist = generateSection.mock.calls[0]?.[0].whitelist;
		expect(whitelist).toEqual(Object.keys(componentEditorConfig.components));
	});

	it("emits structural events only — never document data or prompt text", async () => {
		const events: LoopEvent[] = [];
		await runGeneration({
			...base,
			provider: stagedProvider(),
			onEvent: (event) => events.push(event),
		});

		expect(events.map((e) => e.kind)).toEqual([
			"outline-validated",
			"section-validated",
			"section-validated",
		]);
		const serialized = JSON.stringify(events);
		expect(serialized).not.toContain("pricing page");
		expect(serialized).not.toContain("Badge");
	});
});

describe("progressive updates (FR-036)", () => {
	it("notifies the sink once per validated section, before the final artifact", async () => {
		const seen: number[] = [];
		const sink: ProgressSink = {
			onSectionValidated: (index) => seen.push(index),
		};

		const result = await runGeneration({
			...base,
			provider: stagedProvider(),
			sink,
		});

		// The sink fires per section — those are the NON-recording interim
		// applies. The single recording commit is the plugin's, downstream of
		// the artifact this call returns, so undo removes the whole run.
		expect(seen).toEqual([0, 1]);
		expect(result.sections).toBe(2);
	});
});

describe("repair loop (DOC-02 §9)", () => {
	it("repairs a malformed outline and then succeeds", async () => {
		let calls = 0;
		const provider = stagedProvider({
			generateOutline: async () => {
				calls += 1;
				return calls === 1
					? { runId: "o", artifact: { sections: "not-an-array" } }
					: {
							runId: "o",
							artifact: { sections: [{ id: "s1", intent: "hero" }] },
						};
			},
		});

		const events: LoopEvent[] = [];
		const result = await runGeneration({
			...base,
			provider,
			onEvent: (event) => events.push(event),
		});

		expect(calls).toBe(2);
		expect(result.sections).toBe(1);
		expect(events.some((e) => e.kind === "repair-attempt")).toBe(true);
	});

	it("salvages a fenced JSON string without spending a repair turn", async () => {
		let calls = 0;
		const provider = stagedProvider({
			generateOutline: async () => {
				calls += 1;
				return {
					runId: "o",
					artifact: '```json\n{"sections":[{"id":"s1","intent":"hero"}],}\n```',
				};
			},
		});

		const result = await runGeneration({ ...base, provider });
		expect(calls).toBe(1);
		expect(result.sections).toBe(1);
	});

	it("stops at maxRetries and throws GateExhaustedError, applying NOTHING", async () => {
		const sink = { onSectionValidated: vi.fn() };
		const provider = stagedProvider({
			generateOutline: async () => ({ runId: "o", artifact: { sections: [] } }),
		});

		const events: LoopEvent[] = [];
		await expect(
			runGeneration({
				...base,
				provider,
				maxRetries: 2,
				sink,
				onEvent: (event) => events.push(event),
			}),
		).rejects.toBeInstanceOf(GateExhaustedError);

		// Nothing reached the canvas — S7: the document is untouched.
		expect(sink.onSectionValidated).not.toHaveBeenCalled();
		const exhausted = events.find((e) => e.kind === "gate-exhausted");
		expect(exhausted).toMatchObject({ artifact: "outline", attempts: 3 });
	});

	it("bounds repair PER ARTIFACT, not per run", async () => {
		// Every section fails once then succeeds: with a per-run bound of 1
		// the second section could not repair. A per-artifact bound lets both.
		const failed = new Set<string>();
		const provider = stagedProvider({
			generateSection: async (request) => {
				if (!failed.has(request.sectionId)) {
					failed.add(request.sectionId);
					return { runId: "s", artifact: "not json {{{" };
				}
				return { runId: "s", artifact: irOf(request.sectionId) };
			},
		});

		const result = await runGeneration({ ...base, provider, maxRetries: 1 });
		expect(result.sections).toBe(2);
	});

	it("clamps maxRetries into core's [0,10] range", async () => {
		const provider = stagedProvider({
			generateOutline: async () => ({ runId: "o", artifact: { sections: [] } }),
		});
		let attempts = 0;
		await expect(
			runGeneration({
				...base,
				provider: {
					...provider,
					generateOutline: async () => {
						attempts += 1;
						return { runId: "o", artifact: { sections: [] } };
					},
				},
				maxRetries: -5,
			}),
		).rejects.toBeInstanceOf(GateExhaustedError);
		// Clamped to 0 retries: exactly one attempt.
		expect(attempts).toBe(1);
	});

	it("renders the repair turn exactly as DOC-02 §9 specifies", () => {
		const text = renderRepairPrompt({
			attempt: 1,
			previousRaw: '{"bad":true}',
			diagnostics: [
				{
					path: "content[0].props.variant",
					message: "Invalid input",
					severity: "error",
				},
				{ path: "", message: "Outline is empty.", severity: "error" },
			],
		});

		expect(text).toContain('{"bad":true}');
		expect(text).toContain("- content[0].props.variant: Invalid input");
		// An empty path still reads as a location, never as a blank bullet.
		expect(text).toContain("- (root): Outline is empty.");
		expect(
			text.endsWith(
				"Correct these problems and return the complete corrected JSON object — not a diff, not commentary.",
			),
		).toBe(true);
	});
});

describe("partial outline (design §6.3 — never silently partial)", () => {
	it("reports validCount/total and throws rather than committing a prefix", async () => {
		const provider = stagedProvider({
			generateSection: async (request) =>
				request.sectionId === "s1"
					? { runId: "s", artifact: irOf("s1") }
					: { runId: "s", artifact: "irreparable {{{" },
		});

		const events: LoopEvent[] = [];
		await expect(
			runGeneration({
				...base,
				provider,
				maxRetries: 0,
				onEvent: (event) => events.push(event),
			}),
		).rejects.toBeInstanceOf(GateExhaustedError);

		expect(events).toContainEqual({
			kind: "partial-outline",
			validCount: 1,
			total: 2,
		});
	});
});

describe("cancellation (DOC-02 §8.2)", () => {
	it("rejects with CancelledError when the signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort();

		await expect(
			runGeneration({
				...base,
				provider: stagedProvider(),
				signal: controller.signal,
			}),
		).rejects.toBeInstanceOf(CancelledError);
	});

	it("stops issuing requests once aborted mid-run", async () => {
		const controller = new AbortController();
		let sectionCalls = 0;
		const provider = stagedProvider({
			generateSection: async (request) => {
				sectionCalls += 1;
				controller.abort();
				return { runId: "s", artifact: irOf(request.sectionId) };
			},
		});

		await expect(
			runGeneration({ ...base, provider, signal: controller.signal }),
		).rejects.toBeInstanceOf(CancelledError);
		expect(sectionCalls).toBe(1);
	});
});

describe("assemble (DOC-02 §8.5)", () => {
	it("produces the PageIR envelope the mock fixtures use", () => {
		const artifact = assemble([irOf("a"), irOf("b")], "My page") as {
			version: string;
			root: { id: string; type: string; children: unknown[] };
			assets: unknown[];
			metadata: { title: string };
		};

		expect(artifact.version).toBe("1");
		expect(artifact.root.id).toBe("root");
		expect(artifact.root.type).toBe("__root__");
		expect(artifact.root.children).toHaveLength(2);
		expect(artifact.assets).toEqual([]);
		expect(artifact.metadata.title).toBe("My page");
	});

	it("tolerates a section that produced no nodes", () => {
		const artifact = assemble([{}, irOf("a")], "t") as {
			root: { children: unknown[] };
		};
		expect(artifact.root.children).toHaveLength(1);
	});
});

describe("single-shot providers", () => {
	it("skips the outline entirely when the provider declares generatePage", async () => {
		const generateOutline = vi.fn();
		const provider: GenerationProvider = {
			...stagedProvider({ generateOutline }),
			generatePage: async () => ({ runId: "p", artifact: irOf("whole") }),
		};

		const result = await runGeneration({ ...base, provider });

		expect(generateOutline).not.toHaveBeenCalled();
		expect(result.sections).toBe(1);
	});
});
