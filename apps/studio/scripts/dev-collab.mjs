#!/usr/bin/env node
// Supervisor for `pnpm dev:collab`: runs the y-websocket reference relay
// alongside `next dev --turbopack` and guarantees they come up and go down
// together.
//
// Why a Node supervisor instead of an inline `relay & trap ...; next dev`
// shell line: `trap` cannot catch SIGKILL (signal 9). When the dev job is
// force-killed (IDE stop button, OOM, `kill -9`), the relay and
// next-server are orphaned — the relay keeps holding $COLLAB_RELAY_PORT
// and next-server keeps Next 16's single-dev-server lock, so every later
// run dies with `EADDRINUSE` and `⨯ Another next dev server is already
// running`.
//
// Lifecycle is INSTANCE-SCOPED via an inherited env tag, not a global
// port/cwd sweep. A global sweep races across overlapping runs: a slow or
// orphaned old supervisor tearing down would SIGKILL the NEW run's relay
// because both use the same port. Each child instead inherits
// ANVILKIT_DEVCOLLAB_OWNER=<supervisor pid>. We only ever reap tagged
// processes whose owning supervisor is dead (true orphans) or, on our own
// shutdown, processes we own. Inherited env survives reparenting, so this
// also catches the next-server worker Next moves out of our process group.
import { spawn } from "node:child_process";
import { readdirSync, readFileSync, readlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const demoDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// COLLAB_RELAY_KIND selects which protocol-relay this supervisor runs:
//   - "hocuspocus" (the `dev` script) → the demo's Hocuspocus dev relay (:31234)
//   - default / "y-websocket" (the `dev:collab` script) → the y-websocket
//     reference relay (:21234 — the E2E and editor `?relay=ws` path)
// The two are wire-incompatible, so the editor's `?relay=` query must match.
const RELAY_KIND =
	process.env.COLLAB_RELAY_KIND === "hocuspocus" ? "hocuspocus" : "y-websocket";
const relayScript =
	RELAY_KIND === "hocuspocus"
		? resolve(demoDir, "scripts/hocuspocus-dev-relay.mjs")
		: resolve(
				demoDir,
				"../../packages/extensions/plugins/plugin-collab-yjs/examples/y-websocket-server.mjs",
			);
// Basename used to identify a stale relay still holding the port, so we only
// ever SIGKILL OUR kind of relay (never an unrelated holder).
const relayScriptName =
	RELAY_KIND === "hocuspocus"
		? "hocuspocus-dev-relay.mjs"
		: "y-websocket-server.mjs";
// Default ports avoid 11234/1234: WSL2 + Windows-host port reservations
// (Hyper-V dynamic exclusion ranges) commonly block both lower ports,
// surfacing as a misleading EADDRINUSE even when `/proc/net/tcp*` is empty.
// Keep in sync with `apps/studio/playwright.config.ts`.
const relayPort =
	RELAY_KIND === "hocuspocus"
		? process.env.COLLAB_HOCUSPOCUS_PORT || "31234"
		: process.env.COLLAB_RELAY_PORT || "21234";
const nextArgs = ["dev", "--turbopack", ...process.argv.slice(2)];

const OWNER = String(process.pid);
const childEnv = { ...process.env, ANVILKIT_DEVCOLLAB_OWNER: OWNER };

// Point the Next dev server at the DIRECT dev relay. Without this the collab
// client would derive the proxied same-origin `/collab-ws` path, which only
// exists behind the docker-compose Caddy edge — not in local dev, where the
// relay is a bare process on :31234. Setting it explicitly makes
// `/api/collab/config` serve the direct URL so derivation is bypassed. Respects
// an existing override.
if (RELAY_KIND === "hocuspocus" && !childEnv.COLLAB_HOCUSPOCUS_URL) {
	childEnv.COLLAB_HOCUSPOCUS_URL = `ws://localhost:${relayPort}`;
}

function isAlive(pid) {
	try {
		process.kill(Number(pid), 0);
		return true;
	} catch (e) {
		return e.code === "EPERM";
	}
}

// Return tagged dev:collab pids. With ownerFilter="orphan": only those
// whose owning supervisor is no longer alive (safe to reap on startup —
// never touches a healthy concurrent run). With ownerFilter=OWNER: only
// processes this supervisor started (safe to reap on our own shutdown).
function taggedPids(ownerFilter) {
	if (process.platform !== "linux") return [];
	const out = [];
	let entries;
	try {
		entries = readdirSync("/proc");
	} catch {
		return out;
	}
	for (const name of entries) {
		if (!/^\d+$/.test(name) || name === OWNER) continue;
		let env;
		try {
			env = readFileSync(`/proc/${name}/environ`, "utf8");
		} catch {
			continue; // gone, or not ours to read
		}
		const owner = env
			.split("\0")
			.find((kv) => kv.startsWith("ANVILKIT_DEVCOLLAB_OWNER="))
			?.slice("ANVILKIT_DEVCOLLAB_OWNER=".length);
		if (!owner) continue;
		if (ownerFilter === "orphan") {
			if (!isAlive(owner)) out.push(name);
		} else if (owner === ownerFilter) {
			out.push(name);
		}
	}
	return out;
}

function reap(pids, reason) {
	for (const pid of pids) {
		try {
			process.kill(Number(pid), "SIGKILL");
			console.log(`[dev:collab] reaped ${reason} process ${pid}`);
		} catch {
			/* already gone */
		}
	}
}

// Recover from a prior SIGKILLed run: kill only orphans (owning supervisor
// dead). A concurrent healthy run has a live owner and is left untouched.
reap(taggedPids("orphan"), "orphaned");

// Belt-and-suspenders for relays started OUTSIDE this supervisor (manual
// `node examples/y-websocket-server.mjs`, a Playwright fixture, etc.) —
// those are untagged so `taggedPids` won't see them, and they cause the
// EADDRINUSE the user sees here. Scan /proc for the actual port holder,
// and only SIGKILL it if its cmdline names the relay script. This never
// touches an unrelated process that happens to occupy the configured port.
function relayPortHolders(port) {
	if (process.platform !== "linux") return [];
	const targetHex = Number(port).toString(16).toUpperCase().padStart(4, "0");
	const inodes = new Set();
	for (const fn of ["/proc/net/tcp", "/proc/net/tcp6"]) {
		let body;
		try {
			body = readFileSync(fn, "utf8");
		} catch {
			continue;
		}
		for (const line of body.split("\n").slice(1)) {
			const parts = line.trim().split(/\s+/);
			if (parts.length < 10) continue;
			// st "0A" = TCP_LISTEN; local "HEX:PORTHEX".
			if (parts[3] !== "0A") continue;
			if (!parts[1].endsWith(`:${targetHex}`)) continue;
			if (parts[9] && parts[9] !== "0") inodes.add(parts[9]);
		}
	}
	if (inodes.size === 0) return [];
	const hits = [];
	let procs;
	try {
		procs = readdirSync("/proc");
	} catch {
		return hits;
	}
	for (const p of procs) {
		if (!/^\d+$/.test(p) || p === OWNER) continue;
		let fds;
		try {
			fds = readdirSync(`/proc/${p}/fd`);
		} catch {
			continue;
		}
		let owned = false;
		for (const fd of fds) {
			let link;
			try {
				link = readlinkSync(`/proc/${p}/fd/${fd}`);
			} catch {
				continue;
			}
			const m = /^socket:\[(\d+)\]$/.exec(link);
			if (m && inodes.has(m[1])) {
				owned = true;
				break;
			}
		}
		if (owned) hits.push(p);
	}
	return hits;
}

function reapStaleRelayOnPort(port) {
	for (const pid of relayPortHolders(port)) {
		let cmd = "";
		try {
			cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8");
		} catch {
			continue;
		}
		// Match only our relay kind; never kill arbitrary holders.
		if (!cmd.includes(relayScriptName)) continue;
		try {
			process.kill(Number(pid), "SIGKILL");
			console.log(
				`[dev:collab] reaped stale relay holding :${port} (pid ${pid})`,
			);
		} catch {
			/* gone */
		}
	}
}

reapStaleRelayOnPort(Number(relayPort));

const children = [];
let shuttingDown = false;

function shutdown(code) {
	if (shuttingDown) return;
	shuttingDown = true;

	// Graceful: signal each child's whole process group (negative PID).
	for (const child of children) {
		if (child.exitCode === null && child.signalCode === null) {
			try {
				process.kill(-child.pid, "SIGTERM");
			} catch {
				try {
					child.kill("SIGTERM");
				} catch {
					/* gone */
				}
			}
		}
	}

	// Escalate to SIGKILL on anything WE own that escaped the group
	// (Next reparents its compile worker), then exit. Scoped to OWNER, so
	// this can never touch a different dev:collab instance.
	setTimeout(() => {
		reap(taggedPids(OWNER), "lingering");
		process.exit(code ?? 0);
	}, 2000);
}

function start(name, command, args) {
	// detached:true → child leads its own process group so we can signal
	// the whole tree (relay/next + their workers) at once.
	const child = spawn(command, args, {
		stdio: "inherit",
		detached: true,
		cwd: demoDir,
		env: childEnv,
	});
	children.push(child);
	child.on("exit", (code, signal) => {
		if (shuttingDown) return;
		console.log(
			`[dev:collab] ${name} exited (${signal || `code ${code}`}); shutting down`,
		);
		shutdown(code ?? (signal ? 1 : 0));
	});
	child.on("error", (err) => {
		console.error(`[dev:collab] failed to start ${name}: ${err.message}`);
		shutdown(1);
	});
	return child;
}

start("relay", process.execPath, [relayScript, relayPort]);
start("next", resolve(demoDir, "node_modules/.bin/next"), nextArgs);

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
	process.on(sig, () => shutdown(0));
}

// Parent-death watch. If pnpm / the shell wrapper is hard-killed, this
// supervisor is reparented and would otherwise keep running forever,
// holding the relay port and Next's dev lock. Detect the reparent and
// shut down cleanly so the next run starts clean.
const initialPpid = process.ppid;
setInterval(() => {
	if (!shuttingDown && process.ppid !== initialPpid) {
		console.log("[dev:collab] parent exited; shutting down");
		shutdown(0);
	}
}, 1000).unref();
