/**
 * @file Content-free operational events (DD-0019 §22.4).
 *
 * Events contain no text, URLs, prop values, token literals, or
 * preview data — counts, types, and durations only. Core embeds no
 * external analytics SDK; hosts subscribe through the diagnostic
 * port.
 */

import type { EditorError, EditorErrorCode } from "./errors.js";

/** Operational event union (DD-0019 §22.4, verbatim). */
export type EditorEvent =
	| {
			readonly type: "command.committed";
			readonly commandType: string;
			readonly source: string;
			readonly durationMs: number;
			readonly changedNodeCount: number;
	  }
	| {
			readonly type: "command.rejected";
			readonly commandType: string;
			readonly errorCodes: readonly EditorErrorCode[];
	  }
	| {
			readonly type: "gesture.completed";
			readonly gesture: string;
			readonly durationMs: number;
	  }
	| {
			readonly type: "diagnostic.changed";
			readonly severity: string;
			readonly count: number;
	  }
	| {
			readonly type: "export.validation";
			readonly status: "passed" | "failed";
			readonly featureIds: readonly string[];
	  };

/**
 * Read-side diagnostic surface exposed to plugins and hosts: current
 * persistent diagnostics plus an event subscription. Emission happens
 * after commit or rejection (DD-0019 §10.3 rule 7); payloads are
 * content-free by contract.
 */
export interface EditorDiagnosticPort {
	/** Current persistent diagnostics (e.g. collab gating, limit warnings). */
	getDiagnostics(): readonly EditorError[];
	/** Subscribe to operational events. Returns an unsubscribe callback. */
	subscribe(listener: (event: EditorEvent) => void): () => void;
}
