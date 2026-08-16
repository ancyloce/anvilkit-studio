import { createMockGeneratePage } from "@anvilkit/plugin-ai-copilot/mock";
import type {
	GenerationProvider,
	OutlineRequest,
	PageRequest,
	ProviderResult,
	RunEvent,
	SectionRequest,
} from "./provider";

/**
 * MockProvider (design 0022 §7.3): wraps the copilot's existing mock page
 * generator and adds a canned outline, so P0–P2 are fully shippable while
 * the platform side is still being built (PRD F2 risk).
 *
 * It is a REAL provider, not a stub: its output goes through the same gate
 * as the cloud provider's, which is what makes the swap at P3-02 a config
 * flip rather than a code change.
 */

let runCounter = 0;

/** Deterministic run ids — `crypto.randomUUID` would defeat snapshotting. */
function nextRunId(prefix: string): string {
	runCounter += 1;
	return `${prefix}-${runCounter}`;
}

export interface MockProviderOptions {
	/** Artificial latency, to exercise progress UI. Keep well under the
	 * copilot's default 30 s timeout. */
	readonly delayMs?: number;
}

export function createMockProvider(
	options: MockProviderOptions = {},
): GenerationProvider {
	const generatePage = createMockGeneratePage({
		delayMs: options.delayMs ?? 0,
	});

	return {
		id: "mock",

		async generateOutline(request: OutlineRequest): Promise<ProviderResult> {
			// A canned plan: one section per whitelisted type, capped so a
			// large catalog does not produce an absurd outline.
			const sections = request.whitelist.slice(0, 4).map((type, index) => ({
				id: `section-${index + 1}`,
				intent: `${type} section`,
				componentType: type,
			}));
			return {
				runId: nextRunId("outline"),
				artifact: { prompt: request.prompt, sections },
			};
		},

		async generateSection(request: SectionRequest): Promise<ProviderResult> {
			const ir = await generatePage(request.prompt, undefined as never);
			return {
				runId: nextRunId("section"),
				artifact: { sectionId: request.sectionId, ir },
			};
		},

		async generatePage(request: PageRequest): Promise<ProviderResult> {
			const ir = await generatePage(request.prompt, undefined as never);
			return { runId: nextRunId("page"), artifact: ir };
		},

		async *events(runId: string): AsyncIterable<RunEvent> {
			// Progress only — the artifact never rides this channel (§7.2).
			yield { runId, kind: "queued" };
			yield { runId, kind: "running", percent: 50 };
			yield { runId, kind: "done", percent: 100 };
		},
	};
}
