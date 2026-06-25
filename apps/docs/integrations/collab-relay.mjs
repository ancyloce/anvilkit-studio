#!/usr/bin/env node
/**
 * Embedded Hocuspocus WebSocket relay for the docs `/playground?collab=1`
 * route — ported from the live Astro docs app's integration. Two consumers:
 *
 *   1. `collabRelayVitePlugin()` (below, imported by vite.config) starts it on
 *      `vite dev` / `vite preview` and stops it on server close — the TanStack
 *      Start / Vite equivalent of the old Astro integration.
 *   2. Standalone: `node integrations/collab-relay.mjs [port]`.
 *
 * The DEPLOYED docs site is static (Vercel, no WS host), so collab there falls
 * back to the playground's in-memory single-tab transport. This relay is a
 * local dev/preview convenience only.
 *
 * Port 41234 must stay in sync with the client fallback in
 * `src/components/playground.tsx` (`COLLAB_RELAY_PORT`). Override with
 * PUBLIC_COLLAB_WS_PORT or COLLAB_HOCUSPOCUS_PORT.
 *
 * Alpha-grade: in-memory only (no persistence), accepts any token.
 */
import { Server } from "@hocuspocus/server";

export const DEFAULT_RELAY_PORT = 41234;

function resolvePort(explicit) {
	const fromEnv =
		process.env.PUBLIC_COLLAB_WS_PORT ?? process.env.COLLAB_HOCUSPOCUS_PORT;
	return Number.parseInt(String(explicit ?? fromEnv ?? DEFAULT_RELAY_PORT), 10);
}

/**
 * Start a Hocuspocus relay. Resolves to `{ port, destroy }`. Tolerates
 * EADDRINUSE by returning a no-op handle (a relay is already bound).
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
		name: "anvilkit-docs-hocuspocus",
		quiet: true,
		stopOnSignals: false,
	});

	try {
		// Hocuspocus `listen()` never rejects on EADDRINUSE; the bind error
		// surfaces as an async 'error' event → uncaught exception. Attach a
		// one-shot listener so it becomes a catchable rejection.
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
		try {
			await server.destroy();
		} catch {
			/* nothing to tear down */
		}
		return { port, async destroy() {} };
	}
}

/**
 * Vite plugin: start the relay on `vite dev` / `vite preview`, stop on close.
 * `apply: "serve"` keeps it out of the production build.
 *
 * @returns {import('vite').Plugin}
 */
export function collabRelayVitePlugin() {
	/** @type {{ port: number, destroy: () => Promise<void> } | null} */
	let handle = null;
	let chain = Promise.resolve();

	const start = (logger) => {
		chain = chain.then(async () => {
			if (handle) return;
			handle = await startCollabRelay({ log: logger });
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

	const attach = (server) => {
		const logger = {
			info: (m) => server.config.logger.info(`[collab-relay] ${m}`),
			warn: (m) => server.config.logger.warn(`[collab-relay] ${m}`),
		};
		void start(logger);
		server.httpServer?.once("close", () => {
			void stop();
		});
	};

	return {
		name: "anvilkit-collab-relay",
		apply: "serve",
		configureServer: attach,
		configurePreviewServer: attach,
	};
}

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
