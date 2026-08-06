/**
 * @file Reading a component's `metadata.editor` declaration
 * (DD-0019 §8) — React-free.
 *
 * Lives in the engine (its former React-side consumer, config
 * original home) so tooling that never mounts React can use it:
 * `inspectEditorCapabilities` is a build-time/dev-time report a
 * component author runs from a script or a test, and pulling the
 * decoration module would drag React and the whole canvas graph in
 * for a pure object check. `decorate-config.ts` re-exports it, so
 * every existing importer is unchanged.
 *
 * Legacy rule, applied identically everywhere: malformed or absent
 * metadata reads as `undefined` (≡ `styleTarget: "none"`). A component
 * is never punished for not knowing about the editor.
 */

import type { EditorCapabilityMetadata } from "@anvilkit/contracts/editor";

/**
 * Read and structurally validate a component config's
 * `metadata.editor` declaration. Returns `undefined` for anything that
 * is not a well-formed v1 declaration.
 */
export function readEditorMetadata(
	component: unknown,
): EditorCapabilityMetadata | undefined {
	const metadata = (
		component as { metadata?: { editor?: unknown } } | undefined
	)?.metadata?.editor;
	if (
		typeof metadata !== "object" ||
		metadata === null ||
		(metadata as { version?: unknown }).version !== "1"
	) {
		return undefined;
	}
	const styleTarget = (metadata as { styleTarget?: unknown }).styleTarget;
	if (
		styleTarget !== "root" &&
		styleTarget !== "wrapper" &&
		styleTarget !== "none"
	) {
		return undefined;
	}
	return metadata as EditorCapabilityMetadata;
}
