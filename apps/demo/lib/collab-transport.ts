"use client";

import type {
	ConnectionSource,
	ConnectionStatus,
} from "@anvilkit/plugin-collab-yjs";
// Type-only imports so the yjs / y-protocols / y-websocket stack is NOT
// pulled into the default editor bundle. The constructors are loaded via
// dynamic `import()` inside the factories below, which only run under
// `?collab=1` (off by default).
import type { Awareness } from "y-protocols/awareness";
import type { WebsocketProvider } from "y-websocket";
import type { Doc as YDoc } from "yjs";

/**
 * Minimal transport bundle for the consolidated `createCollabPlugin()`
 * factory from `@anvilkit/collab-ui`. The factory owns adapter and data
 * plugin construction; this bundle only owns what the host genuinely
 * controls: the `Y.Doc`, the `Awareness` channel, the optional
 * `WebsocketProvider`, and a `destroy()` to tear them down.
 */
export interface CollabTransportBundle {
	readonly doc: YDoc;
	readonly awareness: Awareness;
	/**
	 * Present only on the relay variant. In-memory transports omit it.
	 */
	readonly provider?: WebsocketProvider;
	/**
	 * Forwarded into `createCollabPlugin({ connectionSource })`. Hosts
	 * with no provider can omit it; the factory falls back to a sensible
	 * default in-memory status.
	 */
	readonly connectionSource?: ConnectionSource;
	readonly destroy: () => void;
}

/**
 * In-memory transport. Y.Doc lives only in the current tab; useful for
 * dogfooding the SnapshotAdapter wiring without a WebSocket relay.
 */
export async function createCollabDemoTransport(): Promise<CollabTransportBundle> {
	const { Doc } = await import("yjs");
	const { Awareness: AwarenessClass } = await import("y-protocols/awareness");
	const doc = new Doc();
	const awareness = new AwarenessClass(doc);
	return {
		doc,
		awareness,
		destroy() {
			awareness.destroy();
			doc.destroy();
		},
	};
}

export interface CreateCollabRelayTransportOptions {
	readonly room: string;
	readonly relayUrl: string;
}

/**
 * y-websocket-backed transport. Maps the provider's `status`/`sync`
 * events into the `ConnectionStatus` contract the plugin's
 * `<SyncActivityIndicator />` reads, so the indicator shows the right
 * state without leaking provider-specific fields.
 */
export async function createCollabRelayTransport(
	options: CreateCollabRelayTransportOptions,
): Promise<CollabTransportBundle> {
	const { Doc } = await import("yjs");
	const { Awareness: AwarenessClass } = await import("y-protocols/awareness");
	const { WebsocketProvider: WebsocketProviderClass } = await import(
		"y-websocket"
	);
	const doc = new Doc();
	const awareness = new AwarenessClass(doc);
	const provider = new WebsocketProviderClass(
		options.relayUrl,
		options.room,
		doc,
		{
			awareness,
			connect: true,
		},
	);

	let queuedEdits = 0;
	doc.on("update", (_update: Uint8Array, origin: unknown) => {
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

	return {
		doc,
		awareness,
		provider,
		connectionSource,
		destroy() {
			provider.destroy();
			awareness.destroy();
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
