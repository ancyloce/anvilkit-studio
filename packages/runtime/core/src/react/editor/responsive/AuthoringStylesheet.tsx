"use client";

/**
 * @file The per-iframe authoring stylesheet binding (PLAN-0020
 * CORE-P1A-009). Lazily loaded; subscribes to the editor bridge and
 * keeps the scoped `<style>` element in the canvas iframe in sync
 * with the authoring state — incremental via the reference-keyed
 * fragment cache. Canvas-iframe styles do not inherit parent CSS
 * (repository rule): every authoring style reaches the preview
 * through this channel.
 */

import {
	type ReactNode,
	use,
	useEffect,
	useState,
	useSyncExternalStore,
} from "react";
import type { InternalEditorCommandPort } from "../command-port.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";
import {
	applyAuthoringStylesheet,
	buildAuthoringStylesheet,
	createStylesheetCache,
} from "./stylesheet.js";

/** Props for the stylesheet binding. */
export interface AuthoringStylesheetProps {
	readonly document: Document;
}

/** Null-rendering subscriber maintaining the iframe stylesheet. */
export default function AuthoringStylesheet({
	document: iframeDoc,
}: AuthoringStylesheetProps): ReactNode {
	const bridge = use(StudioEditorBridgeContext);
	const version = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? zero : bridge.getVersion,
		bridge === null ? zero : bridge.getVersion,
	);
	const [cache] = useState(createStylesheetCache);

	useEffect(() => {
		void version;
		const port = bridge?.port as InternalEditorCommandPort | null | undefined;
		if (port == null) {
			return;
		}
		const snapshot = port.getSnapshot();
		applyAuthoringStylesheet(
			iframeDoc,
			buildAuthoringStylesheet(
				snapshot.authoring,
				snapshot.breakpoints,
				cache,
				// Dev-only counters (CORE-P4-002); `undefined` in production.
				bridge?.perf?.resolverCache,
			),
		);
	}, [bridge, iframeDoc, cache, version]);

	return null;
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
