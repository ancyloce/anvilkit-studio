/**
 * @file Recursive helper that removes every `meta` field from a
 * {@link PageIR} tree.
 *
 * Used by {@link import("../index.js").downgradePageIR | downgradePageIR}
 * to produce a `1.0`-shaped document for consumers that pin against
 * the pre-`PageIRNode.meta` contract. Pure: never mutates its input,
 * always returns a frozen result.
 */

import type { PageIR, PageIRNode } from "@anvilkit/core/types";

export function stripMetaFromTree(ir: PageIR): PageIR {
	return Object.freeze({
		...ir,
		root: stripMetaFromNode(ir.root),
	});
}

function stripMetaFromNode(node: PageIRNode): PageIRNode {
	const children =
		node.children !== undefined
			? Object.freeze(node.children.map(stripMetaFromNode))
			: undefined;

	const stripped: Mutable<PageIRNode> = {
		id: node.id,
		type: node.type,
		props: node.props,
	};
	if (node.slot !== undefined) stripped.slot = node.slot;
	if (node.slotKind !== undefined) stripped.slotKind = node.slotKind;
	if (children !== undefined) stripped.children = children;
	if (node.assets !== undefined) stripped.assets = node.assets;
	// `meta` deliberately omitted — that is the entire point.

	return Object.freeze(stripped);
}

type Mutable<T> = { -readonly [P in keyof T]: T[P] };
