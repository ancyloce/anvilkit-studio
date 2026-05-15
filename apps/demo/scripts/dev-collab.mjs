#!/usr/bin/env node
// Supervisor for `pnpm dev:collab`: runs the y-websocket reference relay
// alongside `next dev --webpack` and guarantees they come up and go down
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
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readdirSync, readFileSync } from "node:fs";

const demoDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const relayScript = resolve(
	demoDir,
	"../../packages/plugins/plugin-collab-yjs/examples/y-websocket-server.mjs",
);
const relayPort = process.env.COLLAB_RELAY_PORT || "11234";
const nextArgs = ["dev", "--webpack", ...process.argv.slice(2)];

const OWNER = String(process.pid);
const childEnv = { ...process.env, ANVILKIT_DEVCOLLAB_OWNER: OWNER };

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
