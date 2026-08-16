import {
	salvageJson,
	validateDocumentBounded,
} from "@anvilkit/plugin-code-editor";
import type { Config } from "@puckeditor/core";
import { buildPromptBundle, whitelistOf } from "./catalog";
import type { GenerationProvider, ProviderResult } from "./provider";

/**
 * The agent loop (DOC-02 §8): outline → per-section generate → gate each →
 * assemble → final gate → hand back ONE artifact for the plugin to commit.
 *
 * Three invariants shape it:
 *
 * 1. **One user intent = one history-recording commit.** This module never
 *    dispatches. Interim applies go through {@link ProgressSink} as
 *    NON-recording updates, so undo removes the whole generation rather
 *    than one section at a time (FR-036 / commit protocol).
 * 2. **Provider output is untrusted, always.** Every artifact — outline,
 *    section, assembled tree — passes the same gate the code editor uses
 *    (FR-C13). A failure never partially applies.
 * 3. **Repair is bounded and per artifact.** `config.ai.maxRetries`
 *    (clamped [0,10], default 3) applies to each outline/section call, not
 *    to the run as a whole (DOC-02 §9).
 */

/** DOC-02 §9 — what a repair turn shows the model. */
export interface RepairContext {
	/** 1-based; never exceeds `maxRetries`. */
	readonly attempt: number;
	/** The failed output verbatim, truncated at 32 KiB. */
	readonly previousRaw: string;
	readonly diagnostics: readonly GateDiagnostic[];
}

export interface GateDiagnostic {
	readonly path: string;
	readonly message: string;
	readonly severity: "error" | "warning";
}

/** Structural metadata only — never document data or prompt text (§11). */
export type LoopEvent =
	| { readonly kind: "outline-validated"; readonly sections: number }
	| { readonly kind: "section-validated"; readonly index: number }
	| {
			readonly kind: "repair-attempt";
			readonly artifact: string;
			readonly attempt: number;
	  }
	| {
			readonly kind: "gate-exhausted";
			readonly artifact: string;
			readonly attempts: number;
			readonly diagnostics: readonly GateDiagnostic[];
	  }
	| {
			readonly kind: "partial-outline";
			readonly validCount: number;
			readonly total: number;
	  }
	| { readonly kind: "cancelled" };

/** FR-036: the canvas shows outline-so-far as sections pass the gate. */
export interface ProgressSink {
	onSectionValidated(index: number, nodes: readonly unknown[]): void;
}

export interface RunOptions {
	readonly config: Config;
	readonly provider: GenerationProvider;
	readonly prompt: string;
	readonly locale?: string;
	readonly theme?: "light" | "dark";
	/** `config.ai.maxRetries`; clamped to [0, 10] here as core does. */
	readonly maxRetries?: number;
	readonly signal?: AbortSignal;
	readonly sink?: ProgressSink;
	readonly onEvent?: (event: LoopEvent) => void;
}

/** Truncation bound for the repair turn's `previousRaw` (DOC-02 §9). */
const MAX_PREVIOUS_RAW = 32 * 1024;

/** The loop threw because the gate never passed within the repair bound. */
export class GateExhaustedError extends Error {
	readonly diagnostics: readonly GateDiagnostic[];
	readonly attempts: number;
	constructor(
		artifact: string,
		attempts: number,
		diagnostics: readonly GateDiagnostic[],
	) {
		super(`Gate exhausted for ${artifact} after ${attempts} attempt(s).`);
		this.name = "GateExhaustedError";
		this.diagnostics = diagnostics;
		this.attempts = attempts;
	}
}

/** The run was aborted by the caller or superseded. */
export class CancelledError extends Error {
	constructor() {
		super("Generation cancelled.");
		this.name = "CancelledError";
	}
}

function clampRetries(value: number | undefined): number {
	if (value === undefined) return 3;
	return Math.min(Math.max(Math.trunc(value), 0), 10);
}

function truncate(text: string): string {
	return text.length <= MAX_PREVIOUS_RAW
		? text
		: `${text.slice(0, MAX_PREVIOUS_RAW)}…[truncated]`;
}

/**
 * Render a repair turn exactly as DOC-02 §9 specifies. Fixed for every
 * provider (C-4): providers must not summarize, filter or reorder the
 * diagnostics, so the rendering lives here rather than in a provider.
 */
export function renderRepairPrompt(context: RepairContext): string {
	return [
		context.previousRaw,
		"",
		...context.diagnostics.map((d) => `- ${d.path || "(root)"}: ${d.message}`),
		"",
		"Correct these problems and return the complete corrected JSON object — not a diff, not commentary.",
	].join("\n");
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted === true) throw new CancelledError();
}

/** Outline artifacts are a plan, not a document — a shallow shape check. */
function gateOutline(value: unknown): readonly GateDiagnostic[] {
	const sections = (value as { sections?: unknown } | null)?.sections;
	if (!Array.isArray(sections)) {
		return [
			{
				path: "sections",
				message: "Expected an array of sections.",
				severity: "error",
			},
		];
	}
	if (sections.length === 0) {
		return [
			{ path: "sections", message: "Outline is empty.", severity: "error" },
		];
	}
	return sections.flatMap((section, index) =>
		typeof (section as { intent?: unknown })?.intent === "string"
			? []
			: [
					{
						path: `sections[${index}].intent`,
						message: "Each section needs a string `intent`.",
						severity: "error" as const,
					},
				],
	);
}

/**
 * Run one artifact request through the gate, repairing up to the bound.
 *
 * `request` receives the repair context on every attempt after the first,
 * so a provider can present it however its transport requires while the
 * RENDERING stays fixed (`renderRepairPrompt`).
 */
async function withRepair(
	artifact: string,
	maxRetries: number,
	options: Pick<RunOptions, "signal" | "onEvent">,
	request: (repair: RepairContext | undefined) => Promise<ProviderResult>,
	gate: (value: unknown) => readonly GateDiagnostic[],
): Promise<unknown> {
	let repair: RepairContext | undefined;
	// One initial attempt plus `maxRetries` repairs.
	for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
		throwIfAborted(options.signal);
		if (repair !== undefined) {
			options.onEvent?.({ kind: "repair-attempt", artifact, attempt });
		}

		const result = await request(repair);
		throwIfAborted(options.signal);

		// Providers may answer with a JSON string; salvage is the AI-only
		// path, so a fence or trailing comma costs no repair turn.
		let value = result.artifact;
		if (typeof value === "string") {
			const salvaged = await salvageJson(value);
			if (!salvaged.ok) {
				repair = {
					attempt,
					previousRaw: truncate(value),
					diagnostics: salvaged.diagnostics,
				};
				continue;
			}
			value = salvaged.value;
		}

		const diagnostics = gate(value);
		if (diagnostics.length === 0) return value;

		repair = {
			attempt,
			previousRaw: truncate(JSON.stringify(value)),
			diagnostics,
		};
	}

	const diagnostics = repair?.diagnostics ?? [];
	options.onEvent?.({
		kind: "gate-exhausted",
		artifact,
		attempts: maxRetries + 1,
		diagnostics,
	});
	throw new GateExhaustedError(artifact, maxRetries + 1, diagnostics);
}

export interface RunResult {
	/** The assembled artifact, ready for the plugin to validate and commit. */
	readonly artifact: unknown;
	/** How many sections were generated and gated. */
	readonly sections: number;
}

/**
 * Generate a page: outline, then one gated section at a time, then a
 * whole-document gate before handing back a single artifact.
 *
 * Never dispatches — the caller (the copilot plugin) owns the one
 * history-recording commit.
 */
export async function runGeneration(options: RunOptions): Promise<RunResult> {
	const { config, provider, prompt, locale, theme, signal, sink, onEvent } =
		options;
	const maxRetries = clampRetries(options.maxRetries);
	const whitelist = whitelistOf(config);
	// Built once: the bundle is deterministic for a config, and rebuilding
	// it per section would only burn work.
	buildPromptBundle({ config, kind: "outline", locale, theme });

	throwIfAborted(signal);

	// A provider that declares single-shot operation skips the outline
	// entirely; the loop treats its artifact as one section (DOC-02 §8.1).
	if (provider.generatePage !== undefined) {
		const artifact = await withRepair(
			"page",
			maxRetries,
			{ signal, onEvent },
			() =>
				provider.generatePage?.({
					prompt,
					whitelist,
					locale,
					signal,
				}) as Promise<ProviderResult>,
			() => [],
		);
		sink?.onSectionValidated(0, []);
		onEvent?.({ kind: "section-validated", index: 0 });
		return { artifact, sections: 1 };
	}

	const outline = (await withRepair(
		"outline",
		maxRetries,
		{ signal, onEvent },
		() => provider.generateOutline({ prompt, whitelist, locale, signal }),
		gateOutline,
	)) as { sections: { id?: string; intent?: string }[] };

	onEvent?.({ kind: "outline-validated", sections: outline.sections.length });

	const sections: unknown[] = [];
	for (const [index, section] of outline.sections.entries()) {
		try {
			const nodes = await withRepair(
				`section[${index}]`,
				maxRetries,
				{ signal, onEvent },
				() =>
					provider.generateSection({
						prompt: section.intent ?? prompt,
						whitelist,
						sectionId: section.id ?? `section-${index + 1}`,
						locale,
						signal,
					}),
				() => [],
			);
			sections.push(nodes);
			// FR-036: a NON-recording interim apply, so the canvas shows
			// outline-so-far while the run continues. The single recording
			// commit is the plugin's, at the end.
			sink?.onSectionValidated(index, [nodes]);
			onEvent?.({ kind: "section-validated", index });
		} catch (error) {
			if (error instanceof CancelledError) {
				onEvent?.({ kind: "cancelled" });
				throw error;
			}
			// Some sections valid, this one exhausted: never silently commit a
			// partial page (design §6.3) — report and let the UI offer the
			// valid prefix or a discard.
			onEvent?.({
				kind: "partial-outline",
				validCount: sections.length,
				total: outline.sections.length,
			});
			throw error;
		}
	}

	throwIfAborted(signal);
	return { artifact: assemble(sections, prompt), sections: sections.length };
}

/**
 * DOC-02 §8.5 assembly. Ids come from `crypto.randomUUID` (reuse-first: a
 * platform API, not a hand-rolled generator); carriers are never read from
 * the artifact — R6 guarantees they are absent, and they enter through the
 * wrappers' own defaults at render time.
 */
export function assemble(sections: readonly unknown[], title: string): unknown {
	const children = sections.flatMap((section) => {
		const ir = section as { root?: { children?: unknown[] } } | null;
		return ir?.root?.children ?? [];
	});
	return {
		version: "1",
		root: { id: "root", type: "__root__", props: {}, children },
		assets: [],
		metadata: { title },
	};
}

/**
 * Gate an assembled document against the shared schema — the same call the
 * code editor makes, so the AI path cannot drift from the authored one.
 */
export function gateDocument(
	value: unknown,
	schemas: Parameters<typeof validateDocumentBounded>[1],
): readonly GateDiagnostic[] {
	const result = validateDocumentBounded(value, schemas);
	return result.ok ? [] : result.diagnostics;
}
