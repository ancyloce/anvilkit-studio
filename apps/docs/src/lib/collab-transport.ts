/**
 * Collab transports for the docs playground.
 *
 * Ported from `apps/studio/lib/collab-transport.ts`:
 *   - {@link createInMemoryCollabTransport}: single-tab `Y.Doc`, no relay.
 *     Used as the fallback when no WebSocket backend answers (e.g. the
 *     deployed static docs site, which can't host one).
 *   - {@link createCollabHocuspocusTransport}: connects to the embedded
 *     Hocuspocus relay that the `collabRelay()` Astro integration starts
 *     automatically during `astro dev` / `astro preview`, giving the
 *     playground a real multi-tab collaboration backend.
 *
 * The yjs / y-protocols / @hocuspocus/provider stack is pulled in via
 * dynamic `import()` so it lands in its own client chunk rather than the
 * playground island's entry.
 */

import type {
	ConnectionSource,
	ConnectionStatus,
} from "@anvilkit/plugin-collab-yjs";
import type { Awareness } from "y-protocols/awareness";
import type { Doc as YDoc } from "yjs";

export interface CollabTransportBundle {
	readonly doc: YDoc;
	readonly awareness: Awareness;
	/**
	 * Forwarded into `createCollabPlugin({ connectionSource })` so the
	 * sync indicator reflects the live socket state. Present only on the
	 * relay variant; the in-memory transport omits it (the factory then
	 * falls back to a sensible in-memory status).
	 */
	readonly connectionSource?: ConnectionSource;
	readonly destroy: () => void;
}

/**
 * In-memory transport. The `Y.Doc` lives only in the current tab — it
 * exercises the consolidated `createCollabPlugin()` adapter wiring
 * without a relay.
 */
export async function createInMemoryCollabTransport(): Promise<CollabTransportBundle> {
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

export interface CreateCollabHocuspocusTransportOptions {
	readonly room: string;
	/** Hocuspocus relay WebSocket URL, e.g. `ws://localhost:41234`. */
	readonly url: string;
	/** Auth token forwarded to the relay's `onAuthenticate` hook. */
	readonly token?: string;
}

/**
 * Hocuspocus-backed transport. The host constructs the provider eagerly
 * (its lifecycle is owned by the bundle's `destroy()`) and — critically —
 * passes in the SAME `Awareness` the adapter reads presence from, so
 * remote cursors/presence actually flow over the wire. Letting the
 * provider mint its own awareness silently breaks presence.
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
		// HocuspocusProvider's event payloads are loosely typed, so we
		// narrow each handler's argument shape inline.
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
		// The provider connects EAGERLY above, but the adapter only invokes
		// this source after its own dynamic `import()` resolves — by which
		// point the initial `connected` / `synced` one-shots have usually
		// already fired and are missed, leaving the indicator stuck on
		// "connecting". Emit the CURRENT state synchronously on attach. The
		// middle `websocketProvider?.status` branch (load-bearing — it was
		// missing from this docs copy) reports a relay that is reachable but
		// already disconnected as `offline` rather than a stuck `connecting`.
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
	// WebSocketStatus enum values are the string literals compared here, so
	// we avoid importing the enum at runtime.
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
