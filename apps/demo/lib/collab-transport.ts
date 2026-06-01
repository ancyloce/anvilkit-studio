"use client";

import type {
	ConnectionSource,
	ConnectionStatus,
} from "@anvilkit/plugin-collab-yjs";
// Type-only imports so the yjs / y-protocols / @hocuspocus/provider stack is
// NOT pulled into the default editor bundle. The constructors are loaded via
// dynamic `import()` inside the factory below, which only runs on the
// dedicated `/collab` BYO route.
import type { Awareness } from "y-protocols/awareness";
import type { Doc as YDoc } from "yjs";

/**
 * Minimal transport bundle for the `/collab` demo route, which intentionally
 * stays on **BYO transport** mode: it tees `connectionSource` into a page-level
 * status badge, so it owns the `Y.Doc` / `Awareness` / provider rather than
 * delegating to `createCollabPlugin({ websocketUrl })`.
 *
 * The `/puck/editor` route and the docs playground use the consolidated
 * one-liner (`createCollabPlugin({ websocketUrl, provider, room })`) and no
 * longer hand-build a transport; the in-memory and y-websocket factories that
 * used to live here moved into `@anvilkit/plugin-collab-yjs/transport`.
 */
export interface CollabTransportBundle {
	readonly doc: YDoc;
	readonly awareness: Awareness;
	/**
	 * Forwarded into `createCollabPlugin({ connectionSource })`.
	 */
	readonly connectionSource?: ConnectionSource;
	readonly destroy: () => void;
}

export interface CreateCollabHocuspocusTransportOptions {
	readonly room: string;
	/** Hocuspocus relay WebSocket URL, e.g. `ws://localhost:1234`. */
	readonly url: string;
	/** Auth token forwarded to the relay's `onAuthenticate` hook. */
	readonly token?: string;
}

/**
 * Hocuspocus-backed transport — the client side of docs Path C
 * (`docs/api/plugin-collab-yjs-api.md`: Hocuspocus relay in front of a
 * Java/Node backend).
 *
 * The host constructs the provider eagerly (its lifecycle is owned by the
 * bundle's `destroy()`) and — critically — the `Awareness` the adapter reads
 * presence from is the SAME instance the provider syncs over the wire. We pass
 * it into the provider config so remote cursors/presence actually flow. Letting
 * `HocuspocusProvider` mint its own awareness (the easy mistake when following
 * the README's `{ document: doc }`-only snippet) leaves the adapter's channel
 * disconnected and silently breaks presence.
 */
export async function createCollabHocuspocusTransport(
	options: CreateCollabHocuspocusTransportOptions,
): Promise<CollabTransportBundle> {
	const { Doc } = await import("yjs");
	const { Awareness: AwarenessClass } = await import("y-protocols/awareness");
	const { HocuspocusProvider: HocuspocusProviderClass } = await import(
		"@hocuspocus/provider"
	);
	const doc = new Doc();
	const awareness = new AwarenessClass(doc);
	const provider = new HocuspocusProviderClass({
		url: options.url,
		name: options.room,
		document: doc,
		// Share the adapter's awareness instance — see the doc comment.
		awareness,
		token: options.token ?? "",
	});

	const connectionSource: ConnectionSource = (emit) => {
		// HocuspocusProvider's event payloads are loosely typed (`Function`),
		// so we narrow each handler's argument shape inline.
		const handleStatus = ({ status }: { status: string }) => {
			emit(mapHocuspocusStatus(status));
		};
		const handleSynced = () => {
			emit({ kind: "synced", since: new Date().toISOString() });
		};
		const handleDisconnect = () => {
			emit({
				kind: "offline",
				since: new Date().toISOString(),
				queuedEdits: 0,
			});
		};
		const handleAuthFailed = ({ reason }: { reason: string }) => {
			emit({
				kind: "error",
				message: `Authentication failed: ${reason}`,
				recoverable: false,
			});
		};
		provider.on("status", handleStatus);
		provider.on("synced", handleSynced);
		provider.on("disconnect", handleDisconnect);
		provider.on("authenticationFailed", handleAuthFailed);
		// The provider connects EAGERLY in the factory above, but the
		// adapter only invokes this source after its dynamic `import()`
		// resolves — by which point the initial `status: connected` /
		// `synced` events have usually already fired and are missed. On a
		// fast (localhost) relay that leaves the indicator stuck on
		// "connecting" forever even though the socket is live and synced.
		// Emit the CURRENT state synchronously on attach so we don't depend
		// on catching those one-shot events.
		if (provider.isSynced) {
			emit({ kind: "synced", since: new Date().toISOString() });
		} else if (
			provider.configuration.websocketProvider?.status === "disconnected"
		) {
			emit({
				kind: "offline",
				since: new Date().toISOString(),
				queuedEdits: 0,
			});
		} else {
			emit({ kind: "connecting" });
		}
		return () => {
			provider.off("status", handleStatus);
			provider.off("synced", handleSynced);
			provider.off("disconnect", handleDisconnect);
			provider.off("authenticationFailed", handleAuthFailed);
		};
	};

	return {
		doc,
		awareness,
		connectionSource,
		destroy() {
			provider.destroy();
			awareness.destroy();
			doc.destroy();
		},
	};
}

function mapHocuspocusStatus(status: string): ConnectionStatus {
	// WebSocketStatus enum values are the string literals compared here,
	// so we avoid importing the enum at runtime.
	switch (status) {
		case "connected":
			return { kind: "synced", since: new Date().toISOString() };
		case "connecting":
			return { kind: "connecting" };
		case "disconnected":
			return {
				kind: "offline",
				since: new Date().toISOString(),
				queuedEdits: 0,
			};
		default:
			return { kind: "reconnecting", attempt: 1, backoffMs: 250 };
	}
}
