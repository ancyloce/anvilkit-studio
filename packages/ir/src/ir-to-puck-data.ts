import type { PageIR } from "@anvilkit/core/types";
import type { Data } from "@puckeditor/core";

/**
 * Reverse of {@link puckDataToIR}: rebuild a Puck `Data` document
 * from a {@link PageIR}.
 *
 * This function proves the round-trip guarantee — the invariant
 * `irToPuckData(puckDataToIR(d)) ≡ d` is what lets us snapshot
 * test IR shapes without drift. It is also the entry point the AI
 * copilot plugin uses to turn a validated LLM `PageIR` response
 * back into a `setData` payload.
 *
 * Returns a plain (un-frozen) Puck `Data` so Puck can mutate it.
 *
 * @param ir - The page IR document to rehydrate.
 * @returns A Puck `Data` equivalent to the IR input.
 */
export function irToPuckData(ir: PageIR): Data {
	// Rebuild content from root.children
	const content = (ir.root.children ?? []).map((child) => ({
		type: child.type,
		props: {
			id: child.id,
			...(child.props as Record<string, unknown>),
		},
	}));

	// Rebuild root — only include `props` if the IR root carried
	// non-empty props (preserves round-trip for `root: {}`).
	const rootProps = ir.root.props as Record<string, unknown>;
	const hasRootProps = Object.keys(rootProps).length > 0;

	const root: Record<string, unknown> = {};
	if (hasRootProps) {
		root.props = { ...rootProps };
	}

	return {
		root,
		content,
	} as Data;
}
