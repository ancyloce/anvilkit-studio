/**
 * @file Definition ⇄ document projection for the isolated component
 * canvas (PLAN-0020 CORE-P2-009F; DD-DEC-010; DD-0019 §14.4).
 *
 * Main-component mode edits a *definition*, but the canvas can only
 * render a `PuckData` document. These two pure functions are that
 * bridge:
 *
 * - {@link componentDocument} projects a definition (under a chosen
 *   variant combination) into a one-root document the canvas renders;
 * - {@link foldComponentDocument} folds an edited document back into
 *   a definition patch.
 *
 * Node ids are preserved in both directions, which is the whole
 * point: definition node ids are the stable addresses that instance
 * overrides and variant patches target (§14.2), so a round-trip that
 * regenerated them would orphan every override in the document.
 *
 * Editing a **variant** combination writes to that variant's patch
 * rather than the definition base — the difference between "change
 * this component" and "change how it looks when large" — so the fold
 * reports which sink the caller should write to.
 */

import type {
	ComponentDefinition,
	JsonValue,
	NodeOverridePatch,
	SerializablePuckNode,
} from "@anvilkit/contracts/editor";
import type { Data as PuckData } from "@puckeditor/core";
import { matchVariant } from "./variants.js";

function isNode(value: unknown): value is SerializablePuckNode {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		typeof (value as { type?: unknown }).type === "string" &&
		typeof (value as { props?: unknown }).props === "object"
	);
}

/**
 * Project a definition into a document the canvas can render.
 *
 * `selection` picks which combination is shown; an empty selection
 * (or one matching no variant) renders the definition base — "main
 * component" mode.
 */
export function componentDocument(
	definition: ComponentDefinition,
	selection: Readonly<Record<string, string>> = {},
): PuckData {
	const patch = matchVariant(definition, selection)?.patch ?? {};
	const apply = (node: SerializablePuckNode): SerializablePuckNode => {
		const id = node.props.id;
		const entry = typeof id === "string" ? patch[id] : undefined;
		const props: Record<string, JsonValue> = {
			...node.props,
			...(entry?.props ?? {}),
		};
		for (const [key, value] of Object.entries(node.props)) {
			if (Array.isArray(value) && value.some(isNode)) {
				props[key] = value.map((child) =>
					isNode(child) ? (apply(child) as unknown as JsonValue) : child,
				);
			}
		}
		return { type: node.type, props };
	};

	return {
		root: { props: {} },
		content: [apply(definition.root)],
		zones: {},
	} as unknown as PuckData;
}

/** Where an isolated-canvas edit should be written back. */
export type ComponentEditSink =
	| { readonly kind: "definition"; readonly root: SerializablePuckNode }
	| {
			readonly kind: "variant";
			readonly variantId: string;
			readonly patch: Readonly<Record<string, NodeOverridePatch>>;
	  };

/** Collect a tree's nodes by id. */
function indexById(
	node: SerializablePuckNode,
	into: Map<string, SerializablePuckNode>,
): void {
	const id = node.props.id;
	if (typeof id === "string") {
		into.set(id, node);
	}
	for (const value of Object.values(node.props)) {
		if (!Array.isArray(value)) {
			continue;
		}
		for (const child of value) {
			if (isNode(child)) {
				indexById(child, into);
			}
		}
	}
}

/** Props that differ between two nodes, ignoring slot children. */
function propDelta(
	before: SerializablePuckNode,
	after: SerializablePuckNode,
): Record<string, JsonValue> {
	const delta: Record<string, JsonValue> = {};
	for (const [key, value] of Object.entries(after.props)) {
		if (Array.isArray(value) && value.some(isNode)) {
			continue;
		}
		if (JSON.stringify(before.props[key]) !== JSON.stringify(value)) {
			delta[key] = value;
		}
	}
	return delta;
}

/**
 * Fold an edited isolated-canvas document back into the definition.
 *
 * With no active variant the edited tree **is** the new definition
 * root. With one active, only the per-node prop deltas against the
 * base are kept, and they become that variant's patch — so editing in
 * a variant never silently rewrites the base every other combination
 * shares.
 *
 * Returns `null` when the document is not a projection of this
 * definition (empty content, or a different root node id).
 */
export function foldComponentDocument(
	definition: ComponentDefinition,
	data: PuckData,
	selection: Readonly<Record<string, string>> = {},
): ComponentEditSink | null {
	const edited = (data.content ?? [])[0];
	if (!isNode(edited)) {
		return null;
	}
	if (edited.props.id !== definition.root.props.id) {
		return null;
	}

	const variant = matchVariant(definition, selection);
	if (variant === undefined) {
		return { kind: "definition", root: edited };
	}

	const baseNodes = new Map<string, SerializablePuckNode>();
	indexById(definition.root, baseNodes);
	const editedNodes = new Map<string, SerializablePuckNode>();
	indexById(edited, editedNodes);

	const patch: Record<string, NodeOverridePatch> = {};
	for (const [id, node] of editedNodes) {
		const before = baseNodes.get(id);
		if (before === undefined) {
			continue;
		}
		const delta = propDelta(before, node);
		if (Object.keys(delta).length > 0) {
			patch[id] = { ...variant.patch[id], props: delta };
		} else if (variant.patch[id] !== undefined) {
			// The edit reverted this node to the base — drop the patch
			// entry rather than persisting a no-op override.
			const { props: _cleared, ...rest } = variant.patch[id];
			if (Object.keys(rest).length > 0) {
				patch[id] = rest;
			}
		}
	}

	return { kind: "variant", variantId: variant.id, patch };
}

/** Every combination a definition's axes can express, in axis order. */
export function variantCombinations(
	definition: ComponentDefinition,
): readonly Readonly<Record<string, string>>[] {
	return definition.variantAxes.reduce<Record<string, string>[]>(
		(combinations, axis) =>
			combinations.flatMap((combination) =>
				axis.options.map((option) => ({
					...combination,
					[axis.id]: option.id,
				})),
			),
		[{}],
	);
}
