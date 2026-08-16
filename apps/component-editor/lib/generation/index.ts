import { createMockProvider } from "./mock-provider";
import { type GenerationProvider, resolveProviderId } from "./provider";

export {
	createMockProvider,
	type MockProviderOptions,
} from "./mock-provider";
export type {
	GenerationProvider,
	GenerationProviderId,
	OutlineRequest,
	PageRequest,
	ProviderResult,
	RunEvent,
	SectionRequest,
} from "./provider";
export { resolveProviderId } from "./provider";

/**
 * The app's provider, chosen by `NEXT_PUBLIC_AI_PROVIDER`.
 *
 * `agent-service` and `puck-cloud` are declared by the port but not yet
 * implemented (P2-07 / later): asking for one fails loudly here rather than
 * silently falling back to mock output, which would look like a working
 * cloud integration.
 */
export function createGenerationProvider(
	env?: string | undefined,
): GenerationProvider {
	const id = resolveProviderId(env);
	if (id === "mock") return createMockProvider();
	throw new Error(
		`NEXT_PUBLIC_AI_PROVIDER="${id}" is not implemented yet (P2-07 lands agent-service). Unset it or use "mock".`,
	);
}
