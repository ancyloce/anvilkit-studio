import type { EditorIntent } from "@anvilkit/core/types";
import type {
	GeneratePageFn,
	RefineSelectionFn,
} from "@anvilkit/plugin-ai-copilot";
import {
	deriveSchemas,
	salvageJson,
	validateIntents,
} from "@anvilkit/plugin-code-editor";
import type { Config as PuckConfig } from "@puckeditor/core";
import type { GenerationProvider } from "./provider";

/**
 * Copilot wiring (design 0022 §6, plan 0036 P0-20).
 *
 * The copilot plugin owns the commit — "one user intent = at most ONE
 * history-recording `setData`" — so this module's only job is to turn the
 * plugin's page/refinement callbacks into provider calls. Nothing here
 * dispatches; nothing here trusts provider output. Refinement is the one
 * exception to the copilot owning its runtime validator: this app owns the
 * shared `validateIntents` gate because the provider artifact is still raw.
 *
 * DOC-02 §8.3 hazard: the copilot's default `timeoutMs` is 30 s. A provider
 * slower than that surfaces as a copilot timeout rather than a provider
 * error, so a host expecting long generations must raise it explicitly at
 * the `createAiCopilotPlugin({ timeoutMs })` call site.
 */

export const COPILOT_DEFAULT_TIMEOUT_MS = 30_000;

/** The copilot's own context type, taken from its public function type. */
type GenerationContext = Parameters<GeneratePageFn>[1];

export interface CopilotGenerators {
	readonly generatePage: GeneratePageFn;
	readonly refineSelection?: RefineSelectionFn;
}

/** Component type names the provider may emit, derived from the context. */
export function whitelistOf(ctx: GenerationContext): string[] {
	const components = (ctx as unknown as { components?: unknown }).components;
	if (Array.isArray(components)) {
		return components
			.map((entry) =>
				typeof entry === "string"
					? entry
					: ((entry as { type?: string }).type ?? ""),
			)
			.filter((type): type is string => type.length > 0);
	}
	if (components !== null && typeof components === "object") {
		return Object.keys(components as Record<string, unknown>);
	}
	return [];
}

/**
 * Build the copilot's host callbacks from a provider.
 *
 * The provider's artifact is untrusted: the copilot validates it before
 * dispatching, and a rejected artifact leaves the document untouched —
 * the P0-20 acceptance.
 */
export function createCopilotGenerators(
	provider: GenerationProvider,
	config: PuckConfig,
): CopilotGenerators {
	const generatePage: GeneratePageFn = async (prompt, ctx) => {
		const whitelist = whitelistOf(ctx);
		const result = provider.generatePage
			? await provider.generatePage({ prompt, whitelist })
			: await provider.generateSection({
					prompt,
					whitelist,
					sectionId: "page",
				});
		// Cast at exactly one point, purely to hand the artifact to the
		// copilot's validator — never to read fields off it here.
		return result.artifact as Awaited<ReturnType<GeneratePageFn>>;
	};

	const refineProvider = provider.refineSelection;
	if (refineProvider === undefined) return { generatePage };

	const schemas = deriveSchemas(config);
	const refineSelection: RefineSelectionFn = async (instruction, ctx) => {
		if (ctx.currentNodes === undefined) {
			throw new Error(
				"Refinement requires current selection nodes before calling the provider.",
			);
		}

		const result = await refineProvider({
			kind: "refine",
			instruction,
			whitelist: ctx.availableComponents.map(
				(component) => component.componentName,
			),
			selection: {
				nodeIds: ctx.nodeIds,
				currentNodes: ctx.currentNodes,
			},
		});
		let raw = result.artifact;
		if (typeof raw === "string") {
			const salvaged = await salvageJson(raw);
			if (!salvaged.ok) {
				throw new Error(
					`Refinement artifact is not valid JSON: ${salvaged.diagnostics
						.map((diagnostic) => diagnostic.message)
						.join("; ")}`,
				);
			}
			raw = salvaged.value;
		}

		const candidate =
			raw !== null && typeof raw === "object" && "intents" in raw
				? (raw as { readonly intents: unknown }).intents
				: undefined;
		const validated = validateIntents(candidate, schemas);
		if (!validated.ok) {
			throw new Error(
				`Refinement intents failed validation: ${validated.diagnostics
					.map((diagnostic) =>
						diagnostic.path.length > 0
							? `${diagnostic.path}: ${diagnostic.message}`
							: diagnostic.message,
					)
					.join("; ")}`,
			);
		}

		const intents = validated.value as readonly EditorIntent[];
		if (intents.length < 1 || intents.length > 10) {
			throw new Error("Refinement must contain between 1 and 10 intents.");
		}

		const selectedIds = new Set(ctx.nodeIds);
		for (const [index, intent] of intents.entries()) {
			const addressedIds =
				intent.kind === "set-instance-variant" || intent.kind === "delete-nodes"
					? intent.nodeIds
					: [intent.nodeId];
			const foreignIds = addressedIds.filter((id) => !selectedIds.has(id));
			if (foreignIds.length > 0) {
				throw new Error(
					`Refinement intent ${index} addresses nodes outside the selection: ${foreignIds.join(", ")}.`,
				);
			}
		}

		return intents;
	};

	return { generatePage, refineSelection };
}
