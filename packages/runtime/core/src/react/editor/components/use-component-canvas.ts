"use client";

/**
 * @file `useComponentCanvas` — the live model behind isolated
 * component editing (PLAN-0028 `p5-006`; DD-DEC-010; DD-0019 §14.4,
 * §10.6).
 *
 * Exposes the active scope's definition, the combination strip, the
 * document projection the canvas renders, and the navigation actions.
 * Scope and the active combination are transient UI state and never
 * enter history (freeze §6).
 *
 * ### What `p5-006` changed
 *
 * The definition was read from
 * `port.getSnapshot().authoring.componentDefinitions` and folded back
 * through `port.execute`. Both are gone: the definition comes from
 * `p2-004`'s projection of the declared `componentLibrary` root prop,
 * and a fold commits through `p3-001`'s
 * {@link useComponentLibraryCommit} (base edits) or `p3-002`'s
 * {@link commitVariantModelUpdate} (variant-patch edits) — one
 * history-recording `setData` either way.
 *
 * `componentDocument` / `foldComponentDocument` are unchanged. They
 * were always pure functions of a `ComponentDefinition`, so the
 * definition⇄document projection needed no rebase — only its source
 * and its sink did.
 */

import type {
	ComponentDefinition,
	EditorError,
} from "@anvilkit/contracts/editor";
import type { Data as PuckData } from "@puckeditor/core";
import { useCallback, useMemo, useState } from "react";
import {
	componentDocument,
	foldComponentDocument,
	variantCombinationKey,
	variantCombinations,
} from "../../../editor/index.js";
import { commitComponentLibraryUpdate } from "../../../puck/update-component-library.js";
import { commitVariantModelUpdate } from "../../../puck/update-variants.js";
import { useShellSelection } from "../composition/use-shell-selection.js";
import { useOptionalDocumentModel } from "../use-document-model.js";
import {
	useComponentEditorRuntime,
	usePuckApiGetter,
} from "./editor-runtime.js";
import { scopedDefinitionId } from "./scope.js";

/** One entry in the variant strip. */
export interface ComponentCombination {
	readonly key: string;
	readonly selection: Readonly<Record<string, string>>;
	/** `"Large / Dark"`, or the main-component label when empty. */
	readonly label: string;
	/** True when a variant declares this combination. */
	readonly declared: boolean;
}

/** The outcome of folding an isolated-canvas edit back. */
export interface ComponentCanvasCommitOutcome {
	readonly status: "committed" | "noop" | "rejected";
	readonly errors: readonly EditorError[];
}

/** The isolated component canvas surface. */
export interface ComponentCanvas {
	readonly definition: ComponentDefinition;
	/** Combination strip: main first, then every expressible combination. */
	readonly combinations: readonly ComponentCombination[];
	readonly activeKey: string;
	readonly setActive: (key: string) => void;
	/** The document the isolated canvas renders. */
	readonly document: PuckData;
	/** Fold an edited document back into the definition. */
	readonly commitDocument: (
		data: PuckData,
	) => ComponentCanvasCommitOutcome | null;
	/** Leave the isolated scope, restoring the page selection. */
	readonly exit: () => void;
}

const MAIN_KEY = "";

function labelFor(
	definition: ComponentDefinition,
	selection: Readonly<Record<string, string>>,
): string {
	const parts = definition.variantAxes
		.map((axis) => {
			const optionId = selection[axis.id];
			const option = axis.options.find((entry) => entry.id === optionId);
			return option?.name;
		})
		.filter((part): part is string => part !== undefined);
	return parts.join(" / ");
}

/**
 * The active isolated component canvas, or `null` in page scope (or
 * when the scoped definition no longer exists).
 *
 * Degrades to `null` outside `<Puck>` rather than throwing — the panel
 * is mounted by chrome that production always renders inside the
 * provider, but tests and hosts may not.
 */
export function useComponentCanvas(): ComponentCanvas | null {
	const model = useOptionalDocumentModel();
	const selection = useShellSelection();
	const runtime = useComponentEditorRuntime();
	const getPuckApi = usePuckApiGetter();
	const [activeKey, setActive] = useState(MAIN_KEY);

	const definition = useMemo((): ComponentDefinition | null => {
		const definitionId = scopedDefinitionId(selection.definitionScope);
		if (definitionId === undefined || model === null) return null;
		return model.componentLibrary?.definitions[definitionId] ?? null;
	}, [model, selection.definitionScope]);

	const combinations = useMemo((): readonly ComponentCombination[] => {
		if (definition === null) {
			return [];
		}
		const declared = new Set(
			definition.variants.map((variant) =>
				variantCombinationKey(variant.selection),
			),
		);
		return [
			{
				key: MAIN_KEY,
				selection: {},
				label: definition.name,
				declared: true,
			},
			...variantCombinations(definition)
				.filter((selectionEntry) => Object.keys(selectionEntry).length > 0)
				.map((selectionEntry) => {
					const key = variantCombinationKey(selectionEntry);
					return {
						key,
						selection: selectionEntry,
						label: labelFor(definition, selectionEntry),
						declared: declared.has(key),
					};
				}),
		];
	}, [definition]);

	const active = combinations.find((entry) => entry.key === activeKey);
	const activeSelection = active?.selection ?? {};

	const document = useMemo(
		() =>
			definition === null
				? ({
						root: { props: {} },
						content: [],
						zones: {},
					} as unknown as PuckData)
				: componentDocument(definition, activeSelection),
		[definition, activeSelection],
	);

	/**
	 * Fold an edited isolated document back.
	 *
	 * The two sinks are genuinely different writes — "change this
	 * component" edits the definition base, "change how it looks when
	 * large" edits that combination's variant patch — so they go to the
	 * two commit helpers that own those carriers rather than to one
	 * generic definition patch. Both are one history entry.
	 */
	const commitDocument = useCallback(
		(data: PuckData): ComponentCanvasCommitOutcome | null => {
			const api = getPuckApi();
			if (definition === null || api === null) return null;
			const sink = foldComponentDocument(definition, data, activeSelection);
			if (sink === null) return null;
			if (sink.kind === "definition") {
				// `p3-001`'s definition commit, bound to whichever `PuckApi` is
				// reachable — `useComponentLibraryCommit` with a null guard, the
				// same pure function and not a second write path.
				const result = commitComponentLibraryUpdate(
					{ getPuckApi: () => api },
					{
						kind: "update",
						definitionId: definition.id,
						update: (current) => ({ ...current, root: sink.root }),
					},
				);
				return { status: result.status, errors: result.errors };
			}
			const result = commitVariantModelUpdate(
				{ getPuckApi: () => api },
				definition.id,
				{
					kind: "set-variant-patch",
					selection: activeSelection,
					patch: sink.patch,
				},
			);
			return { status: result.status, errors: result.errors };
		},
		[definition, activeSelection, getPuckApi],
	);

	return useMemo(() => {
		if (definition === null) {
			return null;
		}
		return {
			definition,
			combinations,
			activeKey,
			setActive,
			document,
			commitDocument,
			exit: () => {
				setActive(MAIN_KEY);
				runtime.exitComponent();
			},
		};
	}, [definition, combinations, activeKey, document, commitDocument, runtime]);
}
