"use client";

/**
 * @file `useDataSources` / `usePreviewData` — the binding editor's
 * view of the host data adapter (PLAN-0020 CORE-P3-005; ED-BIND-003;
 * DD-0019 §19).
 *
 * Follows the `plugin-asset-manager` host-adapter idiom the plan names
 * as precedent: the adapter is optional, and its absence hides the
 * feature rather than erroring. All §19 containment lives in the
 * React-free `editor/bindings/preview-data.ts`; these hooks only bind
 * it to component lifetime and cancel in flight work.
 *
 * Nothing fetched here is written to the document. §19 allows Core to
 * store descriptors and expressions, never preview responses, so
 * results stay in component state and die with the component.
 */

import type {
	DataSourceDescriptor,
	EditorDataSourceAdapter,
	PreviewDataRequest,
} from "@anvilkit/contracts/editor";
import { use, useEffect, useState, useSyncExternalStore } from "react";
import {
	fetchPreviewData,
	type PreviewDataResult,
} from "../../../editor/index.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";

/** Async state shared by both hooks. */
export type DataSourceListState =
	| { readonly status: "idle" }
	| { readonly status: "loading" }
	| {
			readonly status: "ready";
			readonly sources: readonly DataSourceDescriptor[];
	  }
	| { readonly status: "failed"; readonly message: string };

/**
 * The host's data sources, or `idle` when no adapter is configured.
 *
 * `idle` is deliberately distinct from an empty `ready`: no adapter
 * means the binding editor should not appear at all, whereas an
 * adapter that returns nothing means "connected, nothing to bind".
 */
export function useDataSources(): DataSourceListState {
	const adapter = useDataSourceAdapter();
	const [state, setState] = useState<DataSourceListState>({ status: "idle" });

	useEffect(() => {
		if (adapter === undefined) {
			setState({ status: "idle" });
			return;
		}
		const controller = new AbortController();
		let live = true;
		setState({ status: "loading" });

		adapter
			.listSources(controller.signal)
			.then((sources) => {
				if (live) setState({ status: "ready", sources });
			})
			.catch((error: unknown) => {
				// An aborted list is not a failure the author should see —
				// it means the editor moved on.
				if (!live || controller.signal.aborted) return;
				setState({
					status: "failed",
					message:
						error instanceof Error ? error.message : "listSources failed",
				});
			});

		return () => {
			live = false;
			controller.abort();
		};
	}, [adapter]);

	return state;
}

/**
 * Preview data for one request, under the §19 caps.
 *
 * Re-requests when the source or path changes and aborts the previous
 * call, so switching sources quickly cannot land a stale response over
 * a newer one.
 */
export function usePreviewData(
	request: PreviewDataRequest | null,
): PreviewDataResult | null {
	const adapter = useDataSourceAdapter();
	const [result, setResult] = useState<PreviewDataResult | null>(null);

	// Serialized so a caller passing a fresh object literal each render
	// does not re-fetch forever.
	const key = request === null ? null : JSON.stringify(request);

	useEffect(() => {
		if (key === null) {
			setResult(null);
			return;
		}
		const controller = new AbortController();
		let live = true;

		void fetchPreviewData(adapter, JSON.parse(key) as PreviewDataRequest, {
			signal: controller.signal,
		}).then((next) => {
			if (live) setResult(next);
		});

		return () => {
			live = false;
			controller.abort();
		};
	}, [adapter, key]);

	return result;
}

/** The live host adapter, including lazy `EditorRoot` installation. */
function useDataSourceAdapter(): EditorDataSourceAdapter | undefined {
	const bridge = use(StudioEditorBridgeContext);
	const version = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? zero : bridge.getVersion,
		bridge === null ? zero : bridge.getVersion,
	);
	void version;
	return bridge?.editorConfig?.dataSourceAdapter;
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
