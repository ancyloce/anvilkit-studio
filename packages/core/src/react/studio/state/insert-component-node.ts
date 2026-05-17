/**
 * @file Centralized canvas-insertion command for sidebar modules that
 * need to drop a component carrying *custom* props (media url/name,
 * generated id) — values Puck's config-default `insert` action cannot
 * express, so a data-level append is unavoidable.
 *
 * Why a helper instead of inline `setData` in each module:
 *   - Reads the **latest** Puck snapshot at dispatch time (callers
 *     pass the live `getPuck()` result), never a render-stale clone.
 *   - **Preserves zones**: the root and every nested zone are spread
 *     through untouched; only the root `content` array is appended to.
 *   - One typed, documented boundary cast lives here, not duplicated
 *     per call site (review finding M2).
 *
 * Narrower Puck actions (`insert`, `replace`) are used elsewhere
 * (`LayersPanel`, `useInsertSnippet`) where defaults suffice; they
 * cannot seed arbitrary media props, which is why this path appends a
 * fully-formed node.
 */

import type { useGetPuck } from "@puckeditor/core";

export type PuckSnapshot = ReturnType<ReturnType<typeof useGetPuck>>;

/** Stable-enough unique id for a freshly inserted node. */
export function generateNodeId(componentName: string): string {
	return typeof crypto !== "undefined" && "randomUUID" in crypto
		? `${componentName}-${crypto.randomUUID().slice(0, 8)}`
		: `${componentName}-${Date.now().toString(36)}`;
}

/**
 * Append a component node (with caller-supplied props) to the root
 * content of the latest Puck data, preserving all other content and
 * every nested zone. Returns `false` (no dispatch) when the component
 * is not registered in the live Puck config.
 */
export function appendComponentToRoot(
	snapshot: PuckSnapshot,
	componentName: string,
	props: Record<string, unknown>,
): boolean {
	const components = snapshot.config.components ?? {};
	if (!Object.hasOwn(components, componentName)) {
		return false;
	}
	const currentData = snapshot.appState.data;
	const node = { type: componentName, props };
	const nextData = {
		...currentData,
		// Spread keeps `root` and `zones` intact; only root content grows.
		content: [...(currentData.content ?? []), node],
	};
	snapshot.dispatch({
		type: "setData",
		// Single documented boundary cast: `node` is structurally a
		// ComponentData but Puck's generic `Data` type cannot be
		// satisfied without the live Config's component prop map.
		data: nextData as unknown as typeof currentData,
	});
	return true;
}
