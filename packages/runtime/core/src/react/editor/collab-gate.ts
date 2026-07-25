"use client";

/**
 * @file The collaboration authoring gate (PLAN-0020 CORE-P1A-013;
 * DD-0019 §7.4; DD-DEC-019; CORE-P0-020 freeze §3–§4).
 *
 * Pure derivation over the compiled runtime's declared collaboration
 * capabilities: when the editor feature is enabled and any registered
 * plugin declares an encoding other than `"granular-authoring"`,
 * authoring **writers are disabled** while preview and native Puck
 * editing remain fully functional, and a persistent, visible
 * `EDITOR_COLLAB_ENCODING_UNSUPPORTED` diagnostic names **every**
 * declaring plugin (most-conservative-wins across duplicates).
 * Detection is declarative and registration-time — never
 * connection-probing — so gating is deterministic per compile.
 * Undeclared transports remain undetectable (documented limitation).
 */

import type {
	EditorError,
	StudioPluginCollabCapability,
} from "@anvilkit/contracts/editor";

/** One declared collab capability, as projected by `compilePlugins`. */
export interface DeclaredCollabCapability {
	readonly pluginName: string;
	readonly capability: StudioPluginCollabCapability;
}

/**
 * Derive the writer-gate error, or `null` when writers may run.
 * The diagnostic lists every plugin declaring a non-granular encoding
 * (freeze §4) plus each one's encoding in `details`.
 */
export function computeCollabGateError(
	declarations: readonly DeclaredCollabCapability[],
): EditorError | null {
	const blocking = declarations.filter(
		(declaration) => declaration.capability.encoding !== "granular-authoring",
	);
	if (blocking.length === 0) {
		return null;
	}
	return {
		code: "EDITOR_COLLAB_ENCODING_UNSUPPORTED",
		severity: "error",
		message:
			"authoring writers are disabled: a registered collaboration transport " +
			"syncs the document with an encoding that cannot merge concurrent " +
			"authoring edits (preview and native Puck editing remain available)",
		recoverable: true,
		details: {
			plugins: blocking.map((declaration) => declaration.pluginName),
			encodings: blocking.map((declaration) => declaration.capability.encoding),
		},
	};
}
