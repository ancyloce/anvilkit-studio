/**
 * Resolve the browser-reachable Hocuspocus relay URL for the collab demos.
 *
 * Why this exists: the WebSocket is opened by the *browser*, so the relay URL
 * has to be reachable from wherever the page is loaded — which is deploy-
 * specific. `NEXT_PUBLIC_*` is inlined at build time and cannot carry a per-
 * deploy URL into a prebuilt image, so a baked URL only ever works on the
 * machine that also runs the relay.
 *
 * Topology (see docker-compose.yml + Caddyfile): the relay is NOT exposed on a
 * public port. A reverse proxy is the single public origin; it forwards the
 * `/collab-ws/*` path to the relay over the *internal* Docker network. So the
 * browser connects to its OWN origin on that path — `ws(s)://<host>/collab-ws`
 * — which keeps everything same-origin (no cross-port cert, no origin
 * mismatch) and works under TLS (`wss://`) automatically.
 *
 * Resolution order:
 *   1. An explicit per-deploy URL (served at runtime by `/api/collab/config`,
 *      i.e. the `COLLAB_HOCUSPOCUS_URL` env). Used when the relay is reached
 *      directly rather than through the proxy — e.g. LOCAL DEV, where
 *      `scripts/dev-collab.mjs` sets `ws://localhost:31234`.
 *   2. Derive a same-origin proxied URL from the page the browser loaded:
 *      `ws(s)://<current-host>/collab-ws`. `window.location.host` keeps any
 *      non-default port, and `https:` → `wss:`.
 *   3. `ws://localhost/collab-ws` as a last-resort SSR fallback (no `window`).
 */

/** Same-origin path the reverse proxy forwards to the internal relay (`collab:1234`). */
export const COLLAB_WS_PATH = "/collab-ws";

export function resolveCollabRelayUrl(configured?: string | null): string {
	const explicit = configured?.trim();
	if (explicit) return explicit;

	if (typeof window !== "undefined" && window.location?.host) {
		const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
		return `${proto}//${window.location.host}${COLLAB_WS_PATH}`;
	}

	return `ws://localhost${COLLAB_WS_PATH}`;
}
