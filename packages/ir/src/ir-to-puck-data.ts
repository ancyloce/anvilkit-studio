import type { PageIR } from "@anvilkit/core/types";
import type { Data } from "@puckeditor/core";

/**
 * Reverse of {@link puckDataToIR}: rebuild a Puck `Data` document
 * from a {@link PageIR}.
 *
 * This function exists to prove round-tripping — the invariant
 * `irToPuckData(puckDataToIR(d)) ≡ d` is what lets us snapshot
 * test IR shapes without drift. It is also the entry point the AI
 * copilot plugin uses to turn a validated LLM `PageIR` response
 * back into a `setData` payload.
 *
 * **Stubbed in `phase3-002`.** Real implementation lands in
 * `phase3-003`.
 *
 * @param _ir - The page IR document to rehydrate.
 * @returns A Puck `Data` equivalent to the IR input.
 * @throws {Error} Always — the real transform lands in `phase3-003`.
 */
export function irToPuckData(_ir: PageIR): Data {
	throw new Error(
		"[@anvilkit/ir] irToPuckData is not implemented yet — see phase3-003.",
	);
}
