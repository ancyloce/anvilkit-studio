import type { GeneratePageFn } from "@anvilkit/plugin-ai-copilot";
import type { GenerationProvider } from "./provider";

/**
 * Copilot wiring (design 0022 §6, plan 0036 P0-20).
 *
 * The copilot plugin owns the commit — "one user intent = at most ONE
 * history-recording `setData`" — so this module's only job is to turn the
 * plugin's `generatePage` callback into provider calls. Nothing here
 * dispatches; nothing here trusts provider output.
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

	return { generatePage };
}
