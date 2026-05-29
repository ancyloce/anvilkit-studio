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
}
