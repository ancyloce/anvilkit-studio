#!/usr/bin/env node
/**
 * Astro integration + standalone runner that boots an embedded
 * Hocuspocus WebSocket relay so the docs `/playground/?collab=1` route
 * gets a REAL multi-tab collaboration backend automatically — no
 * separate `relay` command to remember. Mirrors `apps/demo`'s
 * Hocuspocus relay (`scripts/hocuspocus-dev-relay.mjs`) but wired into
 * the Astro lifecycle so it comes up and goes down with the server.
 *
 * Coverage:
 *   - `astro dev`     → started on `astro:server:start`, stopped on
 *                       `astro:server:done`.
 *   - `astro preview` → Astro fires NO `astro:server:*` hooks for the
 *                       static preview server, so we start it from
 *                       `astro:config:setup` (command === 'preview') and
 *                       tear it down on process exit.
 *   - `astro build`   → skipped; a one-shot static build has no live
 *                       server to attach a socket to. The DEPLOYED docs
 *                       site is static (Vercel, no SSR adapter) and so
 *                       cannot host a WebSocket — the playground falls
 *                       back to an in-memory single-tab transport there.
 *
 * Standalone:  node integrations/collab-relay.mjs [port]
 *
 * Alpha-grade: in-memory only (no persistence), accepts any token. A
 * production relay owns auth + persistence — see
 * `packages/plugins/plugin-collab-yjs/docs/hocuspocus-deployment.md`.
 */
import { Server } from "@hocuspocus/server";

// 41234 (NOT the demo's 31234): keep the docs relay on its own port so
// running the demo's collab relay and the docs preview side by side does
// not collide. MUST stay in sync with the client fallback in
// `src/components/Playground.tsx`. Override at runtime with
// PUBLIC_COLLAB_WS_PORT (also read by the client island via Astro's
// `import.meta.env`) or COLLAB_HOCUSPOCUS_PORT.
export const DEFAULT_RELAY_PORT = 41234;

function resolvePort(explicit) {
	const fromEnv =
		process.env.PUBLIC_COLLAB_WS_PORT ?? process.env.COLLAB_HOCUSPOCUS_PORT;
	return Number.parseInt(String(explicit ?? fromEnv ?? DEFAULT_RELAY_PORT), 10);
}

/**
 * Start a Hocuspocus relay. Resolves to a `{ port, destroy }` handle.
 * Tolerates `EADDRINUSE` by returning a no-op handle and assuming an
 * existing relay is already bound — common across Astro dev-server
 * restarts (which re-run hooks in the same process) and when the
 * standalone `relay:hocuspocus` script is already running.
 *
 * @param {{ port?: number, log?: { info: (m: string) => void, warn: (m: string) => void } }} [options]
 * @returns {Promise<{ port: number, destroy: () => Promise<void> }>}
 */
export async function startCollabRelay(options = {}) {
	const port = resolvePort(options.port);
	const info = (msg) =>
		options.log ? options.log.info(msg) : console.log(`[collab-relay] ${msg}`);
	const warn = (msg) =>
		options.log ? options.log.warn(msg) : console.warn(`[collab-relay] ${msg}`);

	const server = new Server({
		port,
		// NOTE: no `address` — Hocuspocus forwards it to node as `address`,
		// but node's `listen()` expects `host`, so it's silently dropped.
		// The default already binds all interfaces (so WSL2 / remote
		// browsers reach it, matching the docs dev server's `--host 0.0.0.0`).
		name: "anvilkit-docs-hocuspocus",
		quiet: true,
		// Let Astro / the runner own shutdown. Hocuspocus' own SIGINT/SIGTERM
		// traps call `process.exit` and would fight the dev/preview server.
		stopOnSignals: false,
	});

	try {
		// Hocuspocus' `Server.listen()` attaches no `error` handler to its
		// underlying http server, so a bind failure (EADDRINUSE) surfaces as
		// an async `error` event that becomes an UNCAUGHT EXCEPTION and kills
		// the Astro process — `listen()` itself never rejects. Attach our own
		// one-shot `error` listener so the failure becomes a normal rejection
		// we can catch and downgrade to the no-op handle below.
		await new Promise((resolve, reject) => {
			const onError = (err) => reject(err);
			server.httpServer.once("error", onError);
			server.listen().then(() => {
				server.httpServer.removeListener("error", onError);
				resolve(undefined);
			}, reject);
		});
		info(`collab relay listening on ws://localhost:${port}`);
		return {
			port,
			async destroy() {
				try {
					await server.destroy();
				} catch {
					/* already torn down */
				}
			},
		};
	} catch (error) {
		if (error?.code === "EADDRINUSE") {
			warn(
				`port ${port} already in use — assuming a relay is already ` +
					"running; the playground will connect to it.",
			);
		} else {
			warn(`failed to start collab relay: ${error?.message ?? error}`);
		}
		// The server never bound (no port held), but best-effort tear down
		// its internal handles so nothing leaks.
		try {
			await server.destroy();
		} catch {
			/* nothing to tear down */
		}
		return {
			port,
			async destroy() {
				/* no-op: this process does not own the bound relay */
			},
		};
	}
}

/**
 * Astro integration. Register in `astro.config.mjs`:
 *   integrations: [react(), collabRelay(), starlight({ ... })]
 *
 * @returns {import('astro').AstroIntegration}
 */
export function collabRelay() {
	/** @type {{ port: number, destroy: () => Promise<void> } | null} */
	let handle = null;
	// Serialize start/stop on a single chain so a dev-server restart
	// (server:done → server:start in the same process) can't race destroy
	// against the next listen and leave the relay down.
	/** @type {Promise<unknown>} */
	let chain = Promise.resolve();

	const ensureStarted = (log) => {
		chain = chain.then(async () => {
			if (handle) return;
			handle = await startCollabRelay({ log });
		});
		return chain;
	};

	const stop = () => {
		chain = chain.then(async () => {
			const current = handle;
			handle = null;
			if (current) await current.destroy();
		});
		return chain;
	};

	return {
		name: "anvilkit-collab-relay",
		hooks: {
			"astro:config:setup": ({ command, logger }) => {
				// `astro preview` does NOT fire astro:server:* hooks, so start
				// the relay here for the long-running preview server and clean
				// it up on process exit. `build`/`sync` start nothing.
				if (command !== "preview") return;
				void ensureStarted(logger);
				// Preview fires no astro:server:done, so a process signal is the
				// only teardown hook. Await the relay's async destroy before
				// exiting (an 'exit' listener can't — it runs synchronously and
				// can't drain the destroy microtask). Mirrors the standalone
				// runner below.
				for (const sig of ["SIGINT", "SIGTERM"]) {
					process.once(sig, () => {
						void stop().finally(() => process.exit(0));
					});
				}
			},
			"astro:server:start": ({ logger }) => {
				void ensureStarted(logger);
			},
			"astro:server:done": async () => {
				await stop();
			},
		},
	};
}

export default collabRelay;

// Standalone runner: `node integrations/collab-relay.mjs [port]`.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
	const portArg = process.argv[2]
		? Number.parseInt(process.argv[2], 10)
		: undefined;
	startCollabRelay({ port: portArg }).then((relay) => {
		const shutdown = () => {
			void relay.destroy().finally(() => process.exit(0));
		};
		for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, shutdown);
	});
}
