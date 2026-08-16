/**
 * The generation port (design 0022 §7.1).
 *
 * Every provider — mock, agent-service, puck-cloud — returns **untrusted**
 * output. The validation gate is downstream and provider-independent, which
 * is what lets the cloud provider arrive later (P2-07) without touching a
 * single caller: swapping providers must touch nothing outside this file.
 */

export type GenerationProviderId = "agent-service" | "mock" | "puck-cloud";

export interface OutlineRequest {
	readonly prompt: string;
	/** Component type names the provider may use — derived from the Config. */
	readonly whitelist: readonly string[];
	readonly locale?: string;
	readonly signal?: AbortSignal;
}

export interface SectionRequest {
	readonly prompt: string;
	readonly whitelist: readonly string[];
	/** Which outline entry this section realizes. */
	readonly sectionId: string;
	readonly locale?: string;
	readonly signal?: AbortSignal;
}

export interface PageRequest {
	readonly prompt: string;
	readonly whitelist: readonly string[];
	readonly locale?: string;
	readonly signal?: AbortSignal;
}

/** Progress only — payloads NEVER travel on the event channel (§7.2). */
export interface RunEvent {
	readonly runId: string;
	readonly kind: "queued" | "running" | "progress" | "done" | "error";
	readonly message?: string;
	readonly percent?: number;
}

/**
 * A provider's raw answer. `artifact` is deliberately `unknown`: it has not
 * been through the gate yet, and typing it would invite a caller to trust it.
 */
export interface ProviderResult {
	readonly runId: string;
	readonly artifact: unknown;
}

export interface GenerationProvider {
	readonly id: GenerationProviderId;
	generateOutline(request: OutlineRequest): Promise<ProviderResult>;
	generateSection(request: SectionRequest): Promise<ProviderResult>;
	/** Single-shot fallback for providers that do not stage a plan. */
	generatePage?(request: PageRequest): Promise<ProviderResult>;
	/** Progress stream for a run; absent when a provider cannot report one. */
	events?(runId: string): AsyncIterable<RunEvent>;
}

/**
 * Which provider the app should use. `mock` stays the default until the
 * platform gates close (P3-02 flips it per environment).
 */
export function resolveProviderId(
	env: string | undefined = process.env.NEXT_PUBLIC_AI_PROVIDER,
): GenerationProviderId {
	return env === "agent-service" || env === "puck-cloud" ? env : "mock";
}
