/**
 * In-memory collab transport for the docs playground.
 *
 * Ported from `apps/demo/lib/collab-transport.ts`, trimmed to just the
 * in-memory variant — the docs playground demonstrates the collab UI
 * (room bar, avatar stack, sync indicator, presence layer) against a
 * single-tab `Y.Doc`, with no WebSocket relay to operate. The yjs /
 * y-protocols stack is pulled in via dynamic `import()` so it lands in
 * its own client chunk rather than the playground island's entry.
 */

import type { Awareness } from "y-protocols/awareness";
import type { Doc as YDoc } from "yjs";

export interface CollabTransportBundle {
	readonly doc: YDoc;
	readonly awareness: Awareness;
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
