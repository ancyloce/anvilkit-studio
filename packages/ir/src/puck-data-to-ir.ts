import type { PageIR } from "@anvilkit/core/types";
import type { Config, Data } from "@puckeditor/core";

/**
 * Transform a Puck `Data` document into a normalized {@link PageIR}.
 *
 * This is the primary entry point every Anvilkit export format
 * consumes. Given a Puck `Data` and its matching `Config`, the
 * result is a pure, JSON-serializable `PageIR` with stable node
 * ids, a flattened asset manifest, and resolved slot metadata.
 *
 * **Stubbed in `phase3-002`.** The implementation lands in
 * `phase3-003` alongside the round-trip guarantee
 * (`irToPuckData(puckDataToIR(d)) ≡ d`). Calling this function
 * today throws unconditionally so accidental early use fails
 * loudly instead of silently returning fake data.
 *
 * @param _data - Puck editor document to normalize.
 * @param _config - Puck `Config` matching `_data` (used to resolve
 *   component metadata, default props, and slot fields).
 * @returns The normalized page IR document.
 * @throws {Error} Always — the real transform lands in `phase3-003`.
 */
export function puckDataToIR(_data: Data, _config: Config): PageIR {
	throw new Error(
		"[@anvilkit/ir] puckDataToIR is not implemented yet — see phase3-003.",
	);
}
