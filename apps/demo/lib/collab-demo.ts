"use client";

import {
	createCollabPlugin,
	createYjsAdapter,
} from "@anvilkit/plugin-collab-yjs";
import type { SnapshotAdapter } from "@anvilkit/plugin-version-history";
import type { Config } from "@puckeditor/core";
import { Awareness } from "y-protocols/awareness";
import { Doc as YDoc } from "yjs";

/**
 * Build a single-process collab plugin for the demo. The Y.Doc is
 * scoped to the current browser tab (no transport), which is enough
 * to exercise the SnapshotAdapter v2 wiring and the presence layer
 * in the editor page. A real transport (y-websocket reference relay
 * under packages/plugins/plugin-collab-yjs/examples/) is required
 * for the cross-tab two-session flow.
 */
export interface CollabDemoBundle {
	readonly plugin: ReturnType<typeof createCollabPlugin>;
	readonly adapter: SnapshotAdapter;
	readonly doc: YDoc;
	readonly awareness: Awareness;
}

export function createCollabDemoBundle(
	puckConfig: Config,
	peerId: string,
): CollabDemoBundle {
	const doc = new YDoc();
	const awareness = new Awareness(doc);
	const adapter = createYjsAdapter({
		doc,
		awareness,
		peer: { id: peerId, displayName: peerId, color: peerColor(peerId) },
	});
	const plugin = createCollabPlugin({ adapter, puckConfig });
	return { plugin, adapter, doc, awareness };
}

function peerColor(peerId: string): string {
	// Deterministic pastel from peer id hash, so the cursor color is
	// stable across reloads of the same session.
	let hash = 0;
	for (const ch of peerId) {
		hash = (hash * 31 + ch.charCodeAt(0)) | 0;
	}
	const hue = ((hash % 360) + 360) % 360;
	return `hsl(${hue}, 70%, 55%)`;
}
