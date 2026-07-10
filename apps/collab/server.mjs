#!/usr/bin/env node
/**
 * Production Hocuspocus WebSocket relay for the AnvilKit docs playground
 * (`/playground/?collab=1`).
 *
 * The docs site deploys STATIC (Vercel, no SSR adapter) and cannot host a
 * WebSocket, so real multi-user collaboration needs this always-on relay
 * running somewhere WS-capable (we deploy it to Fly.io). The client
 * (`@hocuspocus/provider`, wired in apps/docs) connects to it over
 * `wss://` via the `PUBLIC_COLLAB_WS_URL` build env.
 *
 * Mirrors the repo's reference recipe
 * (packages/extensions/plugins/plugin-collab-yjs/docs/hocuspocus-deployment.md) but
 * backs persistence with Redis (Upstash) instead of Postgres, per the
 * chosen "durable + multi-instance" mode.
 *
 * Behavior by environment:
 *   - REDIS_URL set  → DURABLE: documents persist to Redis (survive
 *     restarts) AND the Redis extension fans updates out across multiple
 *     relay instances (horizontal scale behind an L4 balancer).
 *   - REDIS_URL unset → EPHEMERAL/in-memory: single instance, rooms reset
 *     on restart. Handy for local `node server.mjs` smoke tests.
 *
 * Access control:
 *   - COLLAB_ALLOWED_ORIGINS (comma-separated) — reject WS upgrades whose
 *     `Origin` isn't allowlisted. Empty = allow any (logged at boot).
 *   - COLLAB_AUTH_TOKEN — when set, require clients to present this exact
 *     token (the playground passes it via PUBLIC_COLLAB_WS_TOKEN). Unset =
 *     open relay (no token required) — fine for a public demo playground.
 */
import { Database } from "@hocuspocus/extension-database";
import { Logger } from "@hocuspocus/extension-logger";
import { Redis } from "@hocuspocus/extension-redis";
import { Server } from "@hocuspocus/server";
import IORedis from "ioredis";

const PORT = Number.parseInt(process.env.PORT ?? "1234", 10);
const NAME = process.env.HOCUSPOCUS_NAME ?? "anvilkit-collab";
const REDIS_URL = process.env.REDIS_URL?.trim() || "";
const AUTH_TOKEN = process.env.COLLAB_AUTH_TOKEN?.trim() || "";
const ALLOWED_ORIGINS = (process.env.COLLAB_ALLOWED_ORIGINS ?? "")
	.split(",")
	.map((entry) => entry.trim())
	.filter(Boolean);
const DOC_PREFIX = process.env.COLLAB_DOC_PREFIX ?? "anvilkit:collab:doc:";
const REDIS_PREFIX = process.env.COLLAB_REDIS_PREFIX ?? "anvilkit:collab";

/** Parse a redis[s]:// URL into ioredis connection fields. */
function parseRedisUrl(url) {
	const parsed = new URL(url);
	return {
		host: parsed.hostname,
		port: Number.parseInt(parsed.port || "6379", 10),
		username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
		password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
		tls: parsed.protocol === "rediss:",
	};
}

/** @type {Array<import("@hocuspocus/server").Extension>} */
const extensions = [new Logger()];
/** @type {IORedis | null} */
let persistenceClient = null;

if (REDIS_URL) {
	const conn = parseRedisUrl(REDIS_URL);

	// Dedicated client for document persistence — kept separate from the
	// Redis extension's own pub/sub + lock connections (a subscriber
	// connection can't also run normal commands). ioredis parses the
	// rediss:// URL and enables TLS automatically.
	persistenceClient = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
	persistenceClient.on("error", (error) =>
		console.error(
			"[collab-relay] redis (persistence) error:",
			error?.message ?? error,
		),
	);

	extensions.push(
		// Load a doc's last snapshot when it opens; persist it on
		// disconnect / interval (Hocuspocus throttles store() for you).
		new Database({
			fetch: async ({ documentName }) => {
				const buf = await persistenceClient.getBuffer(
					DOC_PREFIX + documentName,
				);
				return buf ? new Uint8Array(buf) : null;
			},
			store: async ({ documentName, state }) => {
				await persistenceClient.set(
					DOC_PREFIX + documentName,
					Buffer.from(state),
				);
			},
		}),
		// Fan document + awareness updates out across N relay instances so
		// an L4 balancer can round-robin connections without breaking
		// collaboration. Creates its own ioredis connections from these.
		new Redis({
			host: conn.host,
			port: conn.port,
			prefix: REDIS_PREFIX,
			options: {
				...(conn.username ? { username: conn.username } : {}),
				...(conn.password ? { password: conn.password } : {}),
				...(conn.tls ? { tls: {} } : {}),
				maxRetriesPerRequest: null,
			},
		}),
	);
	console.log(
		`[collab-relay] durable mode: Redis persistence + multi-instance fan-out (${conn.host}:${conn.port}${conn.tls ? " tls" : ""})`,
	);
} else {
	console.warn(
		"[collab-relay] REDIS_URL not set — EPHEMERAL/in-memory mode " +
			"(no persistence, single instance). Set REDIS_URL for production.",
	);
}

function originAllowed(origin) {
	if (ALLOWED_ORIGINS.length === 0) return true; // open; logged at boot
	if (!origin) return false;
	return ALLOWED_ORIGINS.includes(origin);
}

/** @type {Record<string, unknown>} */
const config = {
	port: PORT,
	name: NAME,
	quiet: true,
	// Own shutdown ourselves (below) so destroy() can flush pending stores
	// before exit; Hocuspocus' built-in signal traps would just exit.
	stopOnSignals: false,
	extensions,

	// Reject cross-site / unknown-origin upgrades. Browsers always send
	// Origin; this deters casual abuse of an open relay. Throwing closes
	// the socket with a Forbidden close code.
	async onConnect({ requestHeaders }) {
		const origin = requestHeaders.get("origin") ?? "";
		if (!originAllowed(origin)) {
			console.warn(
				`[collab-relay] rejected connection from disallowed origin: ${origin || "(none)"}`,
			);
			throw new Error("origin not allowed");
		}
	},
};

// Only require a token when COLLAB_AUTH_TOKEN is configured. Defining
// onAuthenticate makes auth mandatory in Hocuspocus, so we attach it
// conditionally — an open demo relay omits it entirely.
if (AUTH_TOKEN) {
	config.onAuthenticate = async ({ token }) => {
		if (token !== AUTH_TOKEN) throw new Error("invalid token");
		return {};
	};
}

const server = new Server(config);

async function shutdown(signal) {
	console.log(`[collab-relay] ${signal} received — flushing + shutting down`);
	try {
		await server.destroy(); // persists pending docs via the Database store()
	} catch (error) {
		console.error("[collab-relay] destroy error:", error?.message ?? error);
	}
	try {
		await persistenceClient?.quit();
	} catch {
		/* ignore */
	}
	process.exit(0);
}

for (const sig of ["SIGINT", "SIGTERM"]) {
	process.on(sig, () => {
		void shutdown(sig);
	});
}

// A relay should fail loud and let the orchestrator (Fly) restart it,
// rather than limp on in a half-broken state.
process.on("uncaughtException", (error) => {
	console.error("[collab-relay] uncaughtException:", error);
	process.exit(1);
});
process.on("unhandledRejection", (error) => {
	console.error("[collab-relay] unhandledRejection:", error);
});

server
	.listen()
	.then(() => {
		const auth = AUTH_TOKEN ? "token-required" : "open";
		const origins = ALLOWED_ORIGINS.length
			? ALLOWED_ORIGINS.join(", ")
			: "ANY (set COLLAB_ALLOWED_ORIGINS to restrict)";
		console.log(
			`[collab-relay] "${NAME}" listening on :${PORT} | auth=${auth} | origins=${origins}`,
		);
	})
	.catch((error) => {
		console.error("[collab-relay] failed to start:", error);
		process.exit(1);
	});
