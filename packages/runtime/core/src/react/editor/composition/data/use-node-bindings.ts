"use client";

/**
 * @file `useNodeBindings` — the Data panel's state, on the canonical
 * read/commit path (PLAN-0028 `p4-002`, PLAN-0026 §3.5).
 *
 * The bindings half of {@link useNodeInteractions}, and deliberately
 * its mirror image: same read source, same commit shape, same gating
 * rule, same "holds no node state" discipline. Two hooks that answer
 * the same question differently is how the two panels would drift.
 *
 * - **Reads** are `useDocumentModel()`. `DocumentNode.bindings` is the
 *   projection of the node's declared `bindings` carrier with invalid
 *   entries already dropped, so the panel never re-validates and never
 *   consults a sidecar.
 * - **Writes** are {@link useBindingsCommit}. One intent is one
 *   functional `setData` with `recordHistory: true`, so an edit is one
 *   undo.
 *
 * **Capability gating is the compiler's.** `declared` reads
 * `metadata.anvilkit.editor.bindings` through the shared
 * `readEditorMetadataFor` — the same module `updateBindingsInData`
 * checks before it will write — so the panel structurally cannot offer
 * a control whose commit would be rejected (§8.5: the host may not
 * fabricate support).
 *
 * **The data-source adapter is a separate availability axis.** §19
 * makes the host adapter the only source of bindable data, so an
 * editor with no adapter has nothing to offer even for a component
 * that declares `bindings`. The two are reported separately rather
 * than collapsed into one boolean, because "this component cannot be
 * bound" and "this editor has no data" are different things to tell an
 * author.
 */

import type {
	Binding,
	BindingTarget,
	SafeExpression,
} from "@anvilkit/contracts/editor";
import { useCallback, useMemo, useState } from "react";
import { readEditorMetadataFor } from "../../../../puck/component-metadata.js";
import { useDocumentModel } from "../../use-document-model.js";
import { useBindingsCommit } from "../use-carrier-commits.js";
import { useShellSelection } from "../use-shell-selection.js";
import { randomId } from "@/shared/node-id";

/** What the Data panel needs. */
export interface NodeBindingsState {
	/** The primary selection, or `null` when nothing is selected. */
	readonly nodeId: string | null;
	/**
	 * Whether the selected component declares the `bindings` carrier.
	 * `false` means the panel must show its empty state rather than a
	 * control that would be rejected on commit.
	 */
	readonly declared: boolean;
	readonly bindings: readonly Binding[];
	/** Errors from the most recent commit, for inline display. */
	readonly lastErrors: readonly string[];
	/** Attach a binding to the selected node. */
	readonly addBinding: (
		target: BindingTarget,
		expression: SafeExpression,
	) => void;
	/** Replace one binding in place. */
	readonly replaceBinding: (next: Binding) => void;
	readonly removeBinding: (bindingId: string) => void;
}

const NO_BINDINGS: readonly Binding[] = Object.freeze([]);
const NO_ERRORS: readonly string[] = Object.freeze([]);

/** Bindings whose owner is the primary selection. */
export function useNodeBindings(): NodeBindingsState {
	const model = useDocumentModel();
	const { primaryId } = useShellSelection();
	const commit = useBindingsCommit();
	const [lastErrors, setLastErrors] = useState<readonly string[]>(NO_ERRORS);

	const node = primaryId === null ? undefined : model.nodes.get(primaryId);
	const declared =
		node !== undefined &&
		readEditorMetadataFor(model.config, node.type)?.bindings === true;

	const bindings = useMemo(
		(): readonly Binding[] => node?.bindings ?? NO_BINDINGS,
		[node],
	);

	/** One commit, one history entry; errors surface, never throw. */
	const apply = useCallback(
		(update: (current: readonly Binding[]) => readonly Binding[]) => {
			if (primaryId === null) return;
			const result = commit(primaryId, update);
			setLastErrors(
				result.status === "rejected"
					? result.errors.map((error) => error.message)
					: NO_ERRORS,
			);
		},
		[commit, primaryId],
	);

	const addBinding = useCallback(
		(target: BindingTarget, expression: SafeExpression): void => {
			if (primaryId === null) return;
			const binding: Binding = {
				version: "1",
				id: randomId(),
				// The carrier lives on the node's own props, so the owner is
				// the node by construction — but §19 declares the member, so
				// it is written rather than left to be inferred.
				nodeId: primaryId,
				target,
				expression,
			};
			apply((current) => [...current, binding]);
		},
		[apply, primaryId],
	);

	const replaceBinding = useCallback(
		(next: Binding): void => {
			apply((current) =>
				current.map((entry) => (entry.id === next.id ? next : entry)),
			);
		},
		[apply],
	);

	const removeBinding = useCallback(
		(bindingId: string): void => {
			apply((current) => current.filter((entry) => entry.id !== bindingId));
		},
		[apply],
	);

	return {
		nodeId: primaryId,
		declared,
		bindings,
		lastErrors,
		addBinding,
		replaceBinding,
		removeBinding,
	};
}
