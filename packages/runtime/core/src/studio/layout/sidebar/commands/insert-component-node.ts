/**
 * @file Centralized canvas-insertion command for sidebar modules that
 * need to drop a component carrying *custom* props (media url/name,
 * generated id) — values Puck's config-default `insert` action cannot
 * express.
 *
 * Why a helper instead of inline `setData` in each module:
 * The write goes through `commitInsertNode`, so the sidebar follows the
 * same slot addressing, collaboration gate, permission checks, retry
 * protocol, and one-history-entry contract as every editor tree insert.
 */

import type { useGetPuck } from "@puckeditor/core";
import { commitInsertNode } from "../../../../../puck/update-tree.js";
import type { WriterGateDep } from "../../../../../puck/writer-gate.js";

export type PuckSnapshot = ReturnType<ReturnType<typeof useGetPuck>>;

/**
 * Unique id for a freshly inserted node.
 *
 * Re-exported from `@/shared/node-id` so existing importers are
 * unchanged; the generator itself moved there when its insecure-origin
 * fallback turned out to collide (review 0036 M-3).
 */
export { generateNodeId } from "@/shared/node-id";

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
	getWriterGateError?: WriterGateDep["getWriterGateError"],
): boolean {
	const components = snapshot.config.components ?? {};
	if (!Object.hasOwn(components, componentName)) {
		return false;
	}
	const id = props.id;
	if (typeof id !== "string" || id.length === 0) return false;
	const result = commitInsertNode(
		{
			getPuckApi: () => snapshot,
			...(getWriterGateError !== undefined ? { getWriterGateError } : {}),
		},
		{ type: componentName, nodeId: id, props },
	);
	return result.status === "committed";
}
