"use client";

/**
 * @file `BindingRenderMount` — feeds `BindingRenderProvider` from the
 * live editor (PLAN-0020 CORE-P3-006; ED-BIND-002; ADR 0006).
 *
 * Splits "where the inputs come from" (here) from "what they mean"
 * (`render-context.tsx`), so the resolution policy stays unit-testable
 * without a bridge.
 *
 * Reads the UI store defensively, exactly like `InteractionRuntimeMount`:
 * `StudioEditorMount` is used in tests and in hosts without the
 * AnvilKit chrome, where `EditorUiStoreProvider` is absent and the
 * selector would throw. No chrome means no preview toggle, so design
 * mode is the right degradation.
 */

import type { BindingV1 } from "@anvilkit/contracts/editor";
import { type ReactNode, use, useMemo, useSyncExternalStore } from "react";
import { EditorUiStoreContext } from "@/state/slices/EditorUiStoreProvider";
import type { StudioEditorBridge } from "../bridge.js";
import { BindingRenderProvider } from "./render-context.js";

/** Props for {@link BindingRenderMount}. */
export interface BindingRenderMountProps {
	readonly bridge: StudioEditorBridge;
	readonly children: ReactNode;
}

const NO_BINDINGS: Readonly<Record<string, BindingV1>> = {};

/** Supply live bindings + the host scope to the render provider. */
export function BindingRenderMount({
	bridge,
	children,
}: BindingRenderMountProps): ReactNode {
	const preview = useOptionalPreviewMode();
	const version = useSyncExternalStore(
		bridge.subscribe,
		bridge.getVersion,
		bridge.getVersion,
	);

	const bindings = useMemo(() => {
		void version;
		return bridge.port?.getSnapshot().authoring.bindings ?? NO_BINDINGS;
	}, [bridge, version]);

	// ADR 0006: the host fills the scope, Core only reads it. An absent
	// scope makes every path resolve `missing`, which renders as
	// indeterminate rather than hidden.
	const scope = bridge.editorConfig?.renderScope ?? EMPTY_SCOPE;

	return (
		<BindingRenderProvider bindings={bindings} scope={scope} preview={preview}>
			{children}
		</BindingRenderProvider>
	);
}

const EMPTY_SCOPE = {} as const;

/** `interactionPreview`, or `false` when the UI store is absent. */
function useOptionalPreviewMode(): boolean {
	const storeApi = use(EditorUiStoreContext);
	return useSyncExternalStore(
		storeApi === null ? noopSubscribe : storeApi.subscribe,
		storeApi === null
			? alwaysDesign
			: () => storeApi.getState().interactionPreview,
		alwaysDesign,
	);
}

function noopSubscribe(): () => void {
	return noop;
}
function noop(): void {
	// No store: the value never changes.
}
function alwaysDesign(): boolean {
	return false;
}
