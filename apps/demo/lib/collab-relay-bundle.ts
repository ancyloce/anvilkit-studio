"use client";

import {
	createCollabPlugin,
	createYjsAdapter,
	type ConnectionSource,
	type ConnectionStatus,
	type YjsSnapshotAdapter,
} from "@anvilkit/plugin-collab-yjs";
import type { Config } from "@puckeditor/core";
import { Awareness } from "y-protocols/awareness";
import { WebsocketProvider } from "y-websocket";
import { Doc as YDoc } from "yjs";
import type { CollabPeer } from "./collab-demo";
import { peerColor } from "./collab-identity";

export interface CollabRelayBundle {
	readonly plugin: ReturnType<typeof createCollabPlugin>;
	readonly adapter: YjsSnapshotAdapter;
	readonly doc: YDoc;
	readonly awareness: Awareness;
	readonly provider: WebsocketProvider;
	readonly destroy: () => void;
}

export interface CreateCollabRelayBundleOptions {
	readonly puckConfig: Config;
	readonly peer: CollabPeer;
	readonly room: string;
	readonly relayUrl: string;
}

/**
 * Build a y-websocket-backed collab bundle for the demo. Status
 * transitions are mapped from the provider's `status` and `sync`
 * events into the `@anvilkit/plugin-collab-yjs` `ConnectionStatus`
 * contract so `<SyncActivityIndicator />` shows the right state
 * without reading provider-specific fields.
 */
export function createCollabRelayBundle(
	options: CreateCollabRelayBundleOptions,
): CollabRelayBundle {
	const doc = new YDoc();
	const awareness = new Awareness(doc);
	const provider = new WebsocketProvider(options.relayUrl, options.room, doc, {
		awareness,
		connect: true,
	});

	let queuedEdits = 0;
	doc.on("update", (_update: Uint8Array, origin: unknown) => {
		// Count local-origin edits while offline. The peer object the
		// adapter passes as `transact` origin is the local peer; treat
		// `null`/`undefined` (network-applied) as not-local.
		if (origin && typeof origin === "object" && "id" in origin) {
			if (provider.wsconnected === false) queuedEdits += 1;
			else queuedEdits = 0;
		}
	});

	const connectionSource: ConnectionSource = (emit) => {
		const handleStatus = (event: { status: string }) => {
			emit(mapProviderStatus(event.status, queuedEdits));
		};
		const handleSync = (synced: boolean) => {
			if (synced) {
				queuedEdits = 0;
				emit({ kind: "synced", since: new Date().toISOString() });
			}
		};
		const handleConnectionError = (event: Event) => {
			emit({
				kind: "error",
				message:
					event instanceof CloseEvent
						? `WebSocket closed (${event.code})`
						: "WebSocket error",
				recoverable: true,
			});
		};
		provider.on("status", handleStatus);
		provider.on("sync", handleSync);
		provider.on("connection-error", handleConnectionError);
		return () => {
			provider.off("status", handleStatus);
			provider.off("sync", handleSync);
			provider.off("connection-error", handleConnectionError);
		};
	};

	const localPeer = {
		id: options.peer.id,
		displayName: options.peer.displayName,
		color: options.peer.color ?? peerColor(options.peer.id),
	};
	const adapter = createYjsAdapter({
		doc,
		awareness,
		peer: localPeer,
		connectionSource,
	});
	const plugin = createCollabPlugin({
		adapter,
		puckConfig: options.puckConfig,
		localPeer,
	});

	return {
		plugin,
		adapter,
		doc,
		awareness,
		provider,
		destroy() {
			provider.destroy();
			adapter.destroy();
			doc.destroy();
		},
	};
}

function mapProviderStatus(
	status: string,
	queuedEdits: number,
): ConnectionStatus {
	switch (status) {
		case "connected":
			return { kind: "synced", since: new Date().toISOString() };
		case "connecting":
			return { kind: "connecting" };
		case "disconnected":
			return {
				kind: "offline",
				since: new Date().toISOString(),
				queuedEdits,
			};
		default:
			return {
				kind: "reconnecting",
				attempt: 1,
				backoffMs: 250,
			};
	}
}
