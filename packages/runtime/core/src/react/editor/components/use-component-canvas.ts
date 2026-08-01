"use client";

/**
 * @file `useComponentCanvas` — the live model behind isolated
 * component editing (PLAN-0020 CORE-P2-009F/G; DD-DEC-010;
 * DD-0019 §14.4, §10.6).
 *
 * Exposes the active scope's definition, the combination strip, the
 * document projection the canvas renders, and the navigation actions.
 * Every mutation goes through the command port; scope and the active
 * combination are transient UI state and never enter history
 * (freeze §6).
 */

import type {
	ComponentDefinitionV1,
	EditorCommandResult,
} from "@anvilkit/contracts/editor";
import type { Data as PuckData } from "@puckeditor/core";
import {
	use,
	useCallback,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react";
import {
	componentDocument,
	foldComponentDocument,
	variantCombinationKey,
	variantCombinations,
} from "../../../editor/index.js";
import type { InternalEditorCommandPort } from "../command-port.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";
import { getEditorScopeController, scopedDefinitionId } from "./scope.js";

/** One entry in the variant strip. */
export interface ComponentCombination {
	readonly key: string;
	readonly selection: Readonly<Record<string, string>>;
	/** `"Large / Dark"`, or the main-component label when empty. */
	readonly label: string;
	/** True when a variant declares this combination. */
	readonly declared: boolean;
}

/** The isolated component canvas surface. */
export interface ComponentCanvas {
	readonly definition: ComponentDefinitionV1;
	/** Combination strip: main first, then every expressible combination. */
	readonly combinations: readonly ComponentCombination[];
	readonly activeKey: string;
	readonly setActive: (key: string) => void;
	/** The document the isolated canvas renders. */
	readonly document: PuckData;
	/** Fold an edited document back into the definition. */
	readonly commitDocument: (
		data: PuckData,
	) => Promise<EditorCommandResult | null>;
	/** Leave the isolated scope, restoring the page selection. */
	readonly exit: () => void;
}

const MAIN_KEY = "";

function labelFor(
	definition: ComponentDefinitionV1,
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
 * The active isolated component canvas, or `null` when the editor is
 * off / loading / in page scope.
 */
export function useComponentCanvas(): ComponentCanvas | null {
	const bridge = use(StudioEditorBridgeContext);
	const version = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? zero : bridge.getVersion,
		bridge === null ? zero : bridge.getVersion,
	);
	const [activeKey, setActive] = useState(MAIN_KEY);

	const port = bridge?.port as InternalEditorCommandPort | null | undefined;
	const selection = bridge?.selection;

	const scopeController = useMemo(
		() =>
			selection == null
				? null
				: getEditorScopeController(selection, {
						getSelection: () => selection.getState(),
						setScope: (scope) => selection.setScope(scope),
						selectMany: (nodeIds) => selection.selectMany(nodeIds),
					}),
		[selection],
	);

	const definition = useMemo((): ComponentDefinitionV1 | null => {
		void version;
		if (port == null) {
			return null;
		}
		const definitionId = scopedDefinitionId(port.getSnapshot().selection.scope);
		if (definitionId === undefined) {
			return null;
		}
		return (
			port.getSnapshot().authoring.componentDefinitions[definitionId] ?? null
		);
	}, [port, version]);

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

	const commitDocument = useCallback(
		async (data: PuckData): Promise<EditorCommandResult | null> => {
			if (definition === null || port == null) {
				return null;
			}
			const sink = foldComponentDocument(definition, data, activeSelection);
			if (sink === null) {
				return null;
			}
			const patch =
				sink.kind === "definition"
					? { root: sink.root }
					: {
							variants: definition.variants.map((variant) =>
								variant.id === sink.variantId
									? { ...variant, patch: sink.patch }
									: variant,
							),
						};
			return port.execute({
				id: crypto.randomUUID(),
				expectedRevision: port.getSnapshot().revision,
				source: "canvas",
				timestamp: Date.now(),
				type: "component.definition.update",
				definitionId: definition.id,
				patch: patch as never,
			});
		},
		[definition, port, activeSelection],
	);

	return useMemo(() => {
		if (definition === null || scopeController === null) {
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
				scopeController.exitScope();
			},
		};
	}, [
		definition,
		combinations,
		activeKey,
		document,
		commitDocument,
		scopeController,
	]);
}

function noopSubscribe(): () => void {
	return noop;
}
function noop(): void {
	// The no-bridge store never changes.
}
function zero(): number {
	return 0;
}
