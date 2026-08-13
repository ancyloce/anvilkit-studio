"use client";

/**
 * @file `usePageAdapter` — host page navigation (PLAN-0020
 * CORE-P3-010; ED-PAGE-001; DD-0019 §18).
 *
 * §18, verbatim: "Without an adapter, page navigation is hidden. Core
 * does not persist page trees or include page switches in Puck
 * history."
 *
 * All three clauses are structural here rather than conventions:
 *
 * - **Hidden without an adapter** — the hook returns `null`, so a
 *   caller has nothing to render. There is no empty-state to
 *   accidentally show.
 * - **No persisted page tree** — descriptors live in component state
 *   and are re-listed from the host. Nothing reaches the sidecar, so
 *   there is no code path that could write one.
 * - **No history entries** — `open()` calls the host and never touches
 *   the command port. Page switching is host navigation, not a
 *   document edit, and putting it in Puck history would make undo
 *   navigate you backwards through pages.
 *
 * `create` and `rename` are optional on the adapter; the hook surfaces
 * them only when the host implements them, so a read-only page source
 * cannot render buttons that would throw.
 */

import type { EditorPageAdapter } from "@anvilkit/contracts/editor";
import {
	use,
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";

/** A page as the navigator renders it. */
export interface PageRow {
	readonly id: string;
	readonly name: string;
}

/** Page navigation state, or `null` when no adapter is configured. */
export interface PageNavigationState {
	readonly status: "loading" | "ready" | "failed";
	readonly pages: readonly PageRow[];
	readonly message?: string;
	readonly open: (pageId: string) => Promise<void>;
	/** Present only when the host implements it. */
	readonly create?: (name: string) => Promise<string>;
	/** Present only when the host implements it. */
	readonly rename?: (pageId: string, name: string) => Promise<void>;
	/** Re-list from the host (after a create/rename, or on demand). */
	readonly refresh: () => void;
}

/**
 * Host page navigation, or `null` when the host configured no adapter.
 */
export function usePageAdapter(): PageNavigationState | null {
	const bridge = use(StudioEditorBridgeContext);
	// `EditorRoot` installs `editorConfig` after chrome can already be
	// mounted. Subscribe to the bridge so that null-at-mount becomes the
	// configured adapter as soon as the lazy editor runtime is ready.
	const version = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? zero : bridge.getVersion,
		bridge === null ? zero : bridge.getVersion,
	);
	void version;
	const adapter = bridge?.editorConfig?.pageAdapter;
	const [pages, setPages] = useState<readonly PageRow[]>([]);
	const [status, setStatus] = useState<"loading" | "ready" | "failed">(
		"loading",
	);
	const [message, setMessage] = useState<string | undefined>(undefined);
	// Generation counter: only the newest list may write state, so a
	// slow first response cannot land on top of a newer refresh.
	const generation = useRef(0);

	const load = useCallback((): void => {
		if (adapter === undefined) return;
		generation.current += 1;
		const mine = generation.current;
		setStatus("loading");

		adapter
			.list()
			.then((descriptors) => {
				if (generation.current !== mine) return;
				setPages(
					descriptors.map((descriptor) => ({
						id: descriptor.id,
						name: descriptor.name,
					})),
				);
				setStatus("ready");
				setMessage(undefined);
			})
			.catch((error: unknown) => {
				if (generation.current !== mine) return;
				setStatus("failed");
				setMessage(error instanceof Error ? error.message : "list failed");
			});
	}, [adapter]);

	useEffect(() => {
		load();
		return () => {
			// Invalidate any in-flight list on unmount or adapter change.
			generation.current += 1;
		};
	}, [load]);

	const refresh = load;

	const open = useCallback(
		async (pageId: string): Promise<void> => {
			// Straight to the host. Deliberately not routed through the
			// command port: a page switch is navigation, and a history
			// entry here would make undo walk backwards through pages.
			await adapter?.open(pageId);
		},
		[adapter],
	);

	const create = useCallback(
		async (name: string): Promise<string> => {
			const id = await requireCreate(adapter)({ name });
			refresh();
			return id;
		},
		[adapter, refresh],
	);

	const rename = useCallback(
		async (pageId: string, name: string): Promise<void> => {
			await requireRename(adapter)(pageId, name);
			refresh();
		},
		[adapter, refresh],
	);

	if (adapter === undefined) return null;

	return {
		status,
		pages,
		...(message === undefined ? {} : { message }),
		open,
		// Surfaced only when the host implements them, so a UI cannot
		// render an action that would throw on click.
		...(adapter.create === undefined ? {} : { create }),
		...(adapter.rename === undefined ? {} : { rename }),
		refresh,
	};
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

function requireCreate(
	adapter: EditorPageAdapter | undefined,
): NonNullable<EditorPageAdapter["create"]> {
	const create = adapter?.create;
	if (create === undefined) {
		throw new Error("page adapter does not implement create()");
	}
	return create.bind(adapter);
}

function requireRename(
	adapter: EditorPageAdapter | undefined,
): NonNullable<EditorPageAdapter["rename"]> {
	const rename = adapter?.rename;
	if (rename === undefined) {
		throw new Error("page adapter does not implement rename()");
	}
	return rename.bind(adapter);
}
