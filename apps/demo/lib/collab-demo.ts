"use client";

import {
	createCollabPlugin,
	createYjsAdapter,
	type YjsSnapshotAdapter,
} from "@anvilkit/plugin-collab-yjs";
import type { Config } from "@puckeditor/core";
import { Awareness } from "y-protocols/awareness";
import { Doc as YDoc } from "yjs";
import { peerColor } from "./collab-identity";

/**
 * Build a single-process collab plugin for the demo. The Y.Doc is
 * scoped to the current browser tab (no transport), which is enough
 * to exercise the SnapshotAdapter v2 wiring and the presence layer
 * in the editor page. A real transport (y-websocket reference relay
 * under packages/plugins/plugin-collab-yjs/examples/) is required
 * for the cross-tab two-session flow — see `collab-relay-bundle.ts`.
 */
export interface CollabDemoBundle {
	readonly plugin: ReturnType<typeof createCollabPlugin>;
	readonly adapter: YjsSnapshotAdapter;
	readonly doc: YDoc;
	readonly awareness: Awareness;
}

export interface CollabPeer {
	readonly id: string;
	readonly displayName: string;
	readonly color?: string;
}

export function createCollabDemoBundle(
	puckConfig: Config,
	peer: CollabPeer,
): CollabDemoBundle {
	const doc = new YDoc();
	const awareness = new Awareness(doc);
	const localPeer = {
		id: peer.id,
		displayName: peer.displayName,
		color: peer.color ?? peerColor(peer.id),
	};
	const adapter = createYjsAdapter({
		doc,
		awareness,
		peer: localPeer,
	});
	const plugin = createCollabPlugin({ adapter, puckConfig, localPeer });
	return { plugin, adapter, doc, awareness };
}
