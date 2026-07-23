/**
 * @file The stable editor error envelope (DD-0019 §9.5).
 *
 * The code union is exactly the fourteen codes of §9.5 — sub-cases
 * are distinguished via `details`, never via new codes (contract
 * freeze CORE-P0-001 §8). Messages are developer-facing; user-facing
 * text is resolved from i18n catalogs by the consuming surface.
 */

/** The frozen editor error code set (DD-0019 §9.5, all 14 codes). */
export type EditorErrorCode =
	| "EDITOR_CONTRACT_UNSUPPORTED_VERSION"
	| "EDITOR_NODE_NOT_FOUND"
	| "EDITOR_NODE_LOCKED"
	| "EDITOR_CAPABILITY_UNSUPPORTED"
	| "EDITOR_INVALID_CSS_VALUE"
	| "EDITOR_TOKEN_CYCLE"
	| "EDITOR_COMPONENT_CYCLE"
	| "EDITOR_BREAKPOINT_INVALID"
	| "EDITOR_EXPORTER_UNSUPPORTED"
	| "EDITOR_COMMAND_CONFLICT"
	| "EDITOR_DEFINITION_REFERENCED"
	| "EDITOR_DEFINITION_UNAVAILABLE"
	| "EDITOR_COLLAB_ENCODING_UNSUPPORTED"
	| "EDITOR_LIMIT_EXCEEDED";

/** The stable error envelope (DD-0019 §9.5, verbatim). */
export interface EditorError {
	readonly code: EditorErrorCode;
	readonly severity: "info" | "warning" | "error";
	readonly message: string;
	readonly path?: readonly (string | number)[];
	readonly nodeIds?: readonly string[];
	readonly recoverable: boolean;
	readonly details?: Readonly<Record<string, unknown>>;
}
