/// <reference types="astro/client" />

/**
 * Public environment exposed to client islands. Merges (declaration
 * merging) into Astro's `ImportMetaEnv`.
 */
interface ImportMetaEnv {
	/**
	 * Port of the local Hocuspocus collab relay started automatically by
	 * the `collabRelay()` Astro integration (integrations/collab-relay.mjs)
	 * during `astro dev` / `astro preview`. The playground's `?collab=1`
	 * mode connects to `ws://<host>:<PUBLIC_COLLAB_WS_PORT>` and falls back
	 * to an in-memory single-tab transport when the relay is unreachable
	 * (e.g. the deployed static site). Defaults to the integration's
	 * `DEFAULT_RELAY_PORT` (41234) when unset.
	 */
	readonly PUBLIC_COLLAB_WS_PORT?: string;
	/**
	 * Full WebSocket URL of the PRODUCTION collab relay (the deployed
	 * `apps/collab` on Fly.io), e.g.
	 * `wss://anvilkit-collab.fly.dev`. When set, the playground's
	 * `?collab=1` mode connects here (taking priority over the local
	 * dev-relay port) — this is how the deployed static docs site gets a
	 * real multi-user backend. Unset → local dev relay / in-memory.
	 */
	readonly PUBLIC_COLLAB_WS_URL?: string;
	/**
	 * Token sent to the production relay when it is configured with
	 * `COLLAB_AUTH_TOKEN`. Omit for an open relay.
	 */
	readonly PUBLIC_COLLAB_WS_TOKEN?: string;
}
