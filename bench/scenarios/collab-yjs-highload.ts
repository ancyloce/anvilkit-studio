/**
 * High-load scenario for `@anvilkit/plugin-collab-yjs`.
 *
 * NOT part of the gated `pnpm bench` suite — a 100-peer scenario is
 * far too noisy to regress CI on. Run it by hand:
 *
 *   pnpm --filter demo dev        # (or build && next start -p 3000)
 *   pnpm bench:collab-highload    # or: pnpm tsx bench/scenarios/collab-yjs-highload.ts
 *
 * What it does
 * ------------
 * 1. Spawns the reference y-websocket relay on a free port.
 * 2. A headless "seed" peer writes a 2000-node `Button` document into
 *    the room and stays connected (keeps the relay's doc alive).
 * 3. N headless collaborator peers join (staggered) and each edits a
 *    disjoint node on an independent timer — concurrent writes from
 *    the relay's / browser's point of view.
 * 4. A probe peer stamps a dedicated node's label with `Date.now()`
 *    on a steady cadence; a headless observer peer + the real browser
 *    both watch for it to time synchronization latency.
 * 5. One real Chromium tab opens the demo editor (`?collab=1&relay=ws`)
 *    so it hydrates the 2000 nodes from the relay. Injected rAF /
 *    Long-Tasks instrumentation + CDP `Performance.getMetrics`
 *    measure jank, blocking and JS-heap trend under the load.
 *
 * Why 1 browser + N headless peers: true OS-thread concurrency for
 * 100 users in one process is impossible. The relay/CRDT/dispatch
 * paths under test cannot tell a headless peer's update from a
 * browser's, so interleaved headless writes are a faithful proxy.
 * `PEER_COUNT` is env-tunable with a documented fallback.
 *
 * The script never throws past `main()`'s `finally`: the relay and
 * browser are always torn down, and a report is written even when the
 * encoding-compat gate fails (so the failure is recorded, not hidden).
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { PageIR } from "@anvilkit/core/types";

import {
	INSTRUMENTATION,
	make2000NodeIR,
	makeNodeLabelMutator,
	PROBE_NODE_ID,
	PROBE_PREFIX,
} from "./highload-fixtures.js";

const HERE = dirname(fileURLToPath(import.meta.url));

// Up to ~100 providers + the relay child each attach process/exit
// listeners; the default limit of 10 would spam MaxListeners warnings.
process.setMaxListeners(0);

/**
 * `@anvilkit/plugin-collab-yjs` is a git submodule with its OWN pnpm
 * workspace — it is NOT symlinked into the repo-root `node_modules`,
 * and neither are its `yjs` / `y-websocket` / `ws` deps. The bench
 * harness is "not a workspace member" (see `bench/package.json`), so
 * a bare `import "@anvilkit/plugin-collab-yjs"` fails under plain
 * `tsx` here (the existing `bench/plugin-collab-yjs.bench.ts` has the
 * same latent issue; it only resolves in CI after a recursive install
 * hoists everything).
 *
 * Resolve every Yjs-ecosystem module from the submodule package's own
 * resolution root via `createRequire`. This both makes the script
 * runnable from a plain checkout AND guarantees a SINGLE shared `yjs`
 * instance across the adapter, the provider, and our own `Y.Doc` —
 * mixing two `yjs` copies would break the library's `instanceof`
 * checks silently.
 */
const COLLAB_PKG_DIR = join(HERE, "../../packages/plugins/plugin-collab-yjs");

interface CollabAdapter {
	save: (ir: PageIR, meta: Record<string, unknown>) => unknown;
	subscribe: (cb: (ir: PageIR) => void) => () => void;
	metrics?: () => unknown;
	destroy?: () => void;
}

interface CollabRuntime {
	YDoc: new () => {
		destroy: () => void;
	};
	WebsocketProvider: new (
		url: string,
		room: string,
		doc: object,
		opts: Record<string, unknown>,
	) => {
		on: (ev: string, cb: (arg: boolean) => void) => void;
		destroy: () => void;
	};
	WS: unknown;
	createYjsAdapter: (opts: {
		doc: object;
		peer: { id: string };
	}) => CollabAdapter;
}

let runtimePromise: Promise<CollabRuntime> | undefined;

function loadCollabRuntime(): Promise<CollabRuntime> {
	if (runtimePromise) return runtimePromise;
	runtimePromise = (async () => {
		const requireFromCollab = createRequire(
			join(COLLAB_PKG_DIR, "package.json"),
		);

		/**
		 * Resolve a package's **ESM** entry from its `package.json`.
		 *
		 * `require.resolve(spec)` returns the CJS `main`
		 * (e.g. `yjs/dist/yjs.cjs`), but the plugin dist does
		 * `import "yjs"` which Node resolves to yjs's ESM entry. Loading
		 * both yields TWO yjs instances → broken `instanceof` →
		 * "Unexpected content type". yjs, y-websocket and ws all expose
		 * `exports["."].import`; picking it makes our `Y.Doc`,
		 * `y-websocket` and the plugin share the single ESM yjs.
		 */
		const importEsm = async (specifier: string) => {
			const pkgJsonPath = requireFromCollab.resolve(
				`${specifier}/package.json`,
			);
			const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
				exports?: { ["."]?: { import?: string } };
				module?: string;
				main?: string;
			};
			const rel =
				pkg.exports?.["."]?.import ?? pkg.module ?? pkg.main ?? "index.js";
			return import(pathToFileURL(join(dirname(pkgJsonPath), rel)).href);
		};

		const yjs = await importEsm("yjs");
		const yws = await importEsm("y-websocket");
		const ws = await importEsm("ws");
		const collab = await import(
			pathToFileURL(join(COLLAB_PKG_DIR, "dist/index.js")).href
		);

		return {
			YDoc: yjs.Doc,
			WebsocketProvider: yws.WebsocketProvider,
			WS: ws.default ?? ws.WebSocket ?? ws,
			createYjsAdapter: collab.createYjsAdapter,
		} as CollabRuntime;
	})();
	return runtimePromise;
}

// ---------------------------------------------------------------- config
const NODE_COUNT = intEnv("NODE_COUNT", 2000);
const PEER_COUNT = intEnv("PEER_COUNT", 99);
const EDIT_RATE_MS = intEnv("EDIT_RATE_MS", 500);
const PROBE_RATE_MS = intEnv("PROBE_RATE_MS", 1000);
const RUN_DURATION_MS = intEnv("RUN_DURATION_MS", 60_000);
const SAMPLE_MS = intEnv("SAMPLE_MS", 2000);
const PEER_STAGGER_MS = intEnv("PEER_STAGGER_MS", 60);
const PEER_SYNC_TIMEOUT_MS = intEnv("PEER_SYNC_TIMEOUT_MS", 5000);
const DEMO_BASE = process.env.ANVILKIT_DEMO_URL ?? "http://localhost:3000";
const ROOM = `highload-${Date.now()}`;
const REPORT_PATH = join(HERE, "collab-yjs-highload-report.md");
/** Gate: browser must hydrate at least this fraction of NODE_COUNT. */
const HYDRATION_GATE = 0.9;

function intEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined) return fallback;
	const n = Number.parseInt(raw, 10);
	return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// ---------------------------------------------------------------- helpers
function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const srv = createServer();
		srv.once("error", reject);
		srv.listen(0, () => {
			const addr = srv.address();
			if (addr && typeof addr === "object") {
				const { port } = addr;
				srv.close(() => resolve(port));
			} else {
				srv.close(() => reject(new Error("could not get a free port")));
			}
		});
	});
}

function pct(values: number[], p: number): number {
	if (values.length === 0) return Number.NaN;
	const s = [...values].sort((a, b) => a - b);
	const idx = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
	return s[idx] as number;
}

function mean(values: number[]): number {
	if (values.length === 0) return Number.NaN;
	return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Least-squares slope of y over x (bytes/ms) — leak indicator. */
function slope(xs: number[], ys: number[]): number {
	const n = xs.length;
	if (n < 2) return Number.NaN;
	const mx = mean(xs);
	const my = mean(ys);
	let num = 0;
	let den = 0;
	for (let i = 0; i < n; i += 1) {
		num += ((xs[i] as number) - mx) * ((ys[i] as number) - my);
		den += ((xs[i] as number) - mx) ** 2;
	}
	return den === 0 ? Number.NaN : num / den;
}

const mib = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
const ms = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)} ms` : "n/a");

// ---------------------------------------------------------------- relay
async function spawnRelay(port: number): Promise<() => Promise<void>> {
	const serverPath = join(
		HERE,
		"../../packages/plugins/plugin-collab-yjs/examples/y-websocket-server.mjs",
	);
	const child = spawn(process.execPath, [serverPath, String(port)], {
		stdio: ["ignore", "pipe", "pipe"],
	});
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	let stdout = "";
	let stderr = "";

	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error(`relay start timeout. stderr=${stderr}`)),
			15_000,
		);
		child.stdout.on("data", (c: string) => {
			stdout += c;
			if (stdout.includes("y-websocket relay listening")) {
				clearTimeout(timeout);
				resolve();
			}
		});
		child.stderr.on("data", (c: string) => {
			stderr += c;
		});
		child.on("exit", (code) => {
			clearTimeout(timeout);
			reject(new Error(`relay exited early (code=${code}). stderr=${stderr}`));
		});
	});

	return async () => {
		const exited = once(child, "exit").catch(() => undefined);
		child.kill();
		await exited;
	};
}

// ---------------------------------------------------------------- peers
interface Peer {
	readonly id: string;
	readonly adapter: CollabAdapter;
	readonly destroy: () => void;
}

async function createPeer(
	id: string,
	relayUrl: string,
	subscribe?: (ir: PageIR) => void,
): Promise<Peer> {
	const { YDoc, WebsocketProvider, WS, createYjsAdapter } =
		await loadCollabRuntime();
	const doc = new YDoc();
	const provider = new WebsocketProvider(relayUrl, ROOM, doc, {
		connect: true,
		// Node 21+ has a global WebSocket, but pin the polyfill so this
		// works on any supported Node without depending on that.
		WebSocketPolyfill: WS,
	});
	const adapter = createYjsAdapter({ doc, peer: { id } });
	if (subscribe) adapter.subscribe(subscribe);

	await new Promise<void>((resolve) => {
		let settled = false;
		const done = () => {
			if (settled) return;
			settled = true;
			resolve();
		};
		provider.on("sync", (s: boolean) => {
			if (s) done();
		});
		setTimeout(done, PEER_SYNC_TIMEOUT_MS);
	});

	return {
		id,
		adapter,
		destroy() {
			try {
				adapter.destroy?.();
			} finally {
				provider.destroy();
				doc.destroy();
			}
		},
	};
}

async function probeDemo(url: string): Promise<boolean> {
	try {
		const res = await fetch(url, { redirect: "manual" });
		return res.status === 200 || res.status === 301 || res.status === 302;
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------- main
async function main(): Promise<void> {
	const editorUrl = `${DEMO_BASE}/puck/editor`;
	if (!(await probeDemo(editorUrl))) {
		console.error(
			`\n  Demo not reachable at ${editorUrl}.\n` +
				`  Start it first:  pnpm --filter demo dev\n` +
				`  (or: pnpm --filter demo build && pnpm --filter demo start)\n`,
		);
		process.exitCode = 1;
		return;
	}

	const port = await freePort();
	const relayUrl = `ws://localhost:${port}`;
	console.log(`relay → ${relayUrl}  room=${ROOM}`);
	const stopRelay = await spawnRelay(port);

	const { ir: baseIR } = make2000NodeIR(NODE_COUNT);

	const peers: Peer[] = [];
	const timers: NodeJS.Timeout[] = [];
	let browser: import("playwright").Browser | undefined;
	let page: import("playwright").Page | undefined;
	let reported = false;

	// Adapter-layer sync latency: receive time − stamp, decoded via
	// the SAME native-tree path the browser's adapter uses.
	const adapterLatencies: number[] = [];
	let lastObservedStamp = 0;

	// Heap / RSS samples: [elapsedMs, bytes].
	const heapSamples: Array<[number, number]> = [];
	const rssSamples: Array<[number, number]> = [];
	// Browser end-to-end visible latency (poll-limited).
	const e2eLatencies: number[] = [];
	let lastE2eStamp = 0;

	let renderCompleteMs = Number.NaN;
	let maxHydrated = 0;
	let gatePassed = false;
	const startedAt = Date.now();

	try {
		// 1. Seed the document.
		const seed = await createPeer("seed", relayUrl);
		peers.push(seed);
		seed.adapter.save(baseIR, {});
		await new Promise((r) => setTimeout(r, 1500));
		console.log(`seeded ${NODE_COUNT}-node document`);

		// 2. Observer peer — primary sync-latency signal.
		const observer = await createPeer("observer", relayUrl, (ir) => {
			const label = findProbeLabel(ir);
			if (!label) return;
			const stamp = Number.parseInt(label.slice(PROBE_PREFIX.length), 10);
			if (Number.isFinite(stamp) && stamp !== lastObservedStamp) {
				lastObservedStamp = stamp;
				adapterLatencies.push(Date.now() - stamp);
			}
		});
		peers.push(observer);

		// Edit-load timers are *created* here but only *started* after
		// the browser has mounted and passed the hydration gate. Starting
		// the 12-peer + probe firehose (≈24 saves/s) before the browser
		// has hydrated the 2000-node doc starves the renderer main thread
		// — the initial 2000-node render is already ~26s of Long Tasks on
		// its own, and the firehose layered on top means Playwright's
		// `waitForSelector(studio-mount, {state:'visible'})` never gets a
		// free main thread to confirm visibility within its 60s budget
		// (root cause of the prior gate timeouts). Deferring also makes
		// "node rendering completion time" a clean number instead of
		// render-cost-conflated-with-sync-under-load.
		const startEditTimers: Array<() => void> = [];

		// 3. Collaborator peers — staggered connect, disjoint edits.
		// A single peer failing to connect must not abort the run.
		console.log(`connecting ${PEER_COUNT} collaborator peers…`);
		for (let i = 0; i < PEER_COUNT; i += 1) {
			let peer: Peer;
			try {
				peer = await createPeer(`collab-${i}`, relayUrl);
			} catch (e) {
				console.warn(`collab-${i} failed to connect: ${String(e)}`);
				continue;
			}
			peers.push(peer);
			const nodeId = `n-${i % NODE_COUNT}`;
			const mutate = makeNodeLabelMutator(baseIR, nodeId);
			let counter = 0;
			startEditTimers.push(() => {
				timers.push(
					setInterval(() => {
						counter += 1;
						peer.adapter.save(mutate(`p${i}#${counter}`), {});
					}, EDIT_RATE_MS),
				);
			});
			if (i % 10 === 0) {
				console.log(`  …${i + 1}/${PEER_COUNT} peers connected`);
			}
			if (PEER_STAGGER_MS > 0) {
				await new Promise((r) => setTimeout(r, PEER_STAGGER_MS));
			}
		}
		console.log(`${Math.max(0, peers.length - 2)} collaborators active`);

		// 4. Probe peer — steady timestamp on the dedicated node.
		const probe = await createPeer("probe", relayUrl);
		peers.push(probe);
		const probeMutate = makeNodeLabelMutator(baseIR, PROBE_NODE_ID);
		startEditTimers.push(() => {
			timers.push(
				setInterval(() => {
					probe.adapter.save(probeMutate(`${PROBE_PREFIX}${Date.now()}`), {});
				}, PROBE_RATE_MS),
			);
		});

		// 5. Real browser editor.
		const { chromium } = await import("playwright");
		// Headless Chromium parks `requestAnimationFrame` when it
		// thinks the page is backgrounded/occluded — without these
		// flags the rAF jank sampler records zero frames. Long Tasks
		// still work regardless, but we want both signals.
		browser = await chromium.launch({
			args: [
				"--disable-background-timer-throttling",
				"--disable-backgrounding-occluded-windows",
				"--disable-renderer-backgrounding",
			],
		});
		const context = await browser.newContext({
			viewport: { width: 1440, height: 900 },
		});
		page = await context.newPage();
		const pg = page;
		await pg.addInitScript(INSTRUMENTATION);
		const cdp = await context.newCDPSession(pg);
		await cdp.send("Performance.enable");

		const url =
			`${editorUrl}?collab=1&relay=ws&relayPort=${port}` +
			`&room=${ROOM}&peer=browser-observer`;
		const navStart = Date.now();
		await pg.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
		// `studio-mount` is the demo's editor shell; it mounts before the
		// 2000-node Y.Doc is synced/converted, so it separates "shell up"
		// from "nodes hydrated" (the latter is the 90s node-count gate
		// below). The old `.Puck` wait raced the full 2000-node main-thread
		// hydration and timed out before the gate could run.
		await pg.waitForSelector('[data-testid="studio-mount"]', {
			timeout: 60_000,
		});

		const readHeap = async (): Promise<number> => {
			const { metrics } = await cdp.send("Performance.getMetrics");
			const m = metrics.find((x) => x.name === "JSHeapUsedSize");
			return m ? m.value : Number.NaN;
		};
		const countHydrated = async (): Promise<number> => {
			try {
				const handle = await pg
					.locator("iframe#preview-frame")
					.elementHandle({ timeout: 2000 });
				const frame = handle ? await handle.contentFrame() : null;
				if (!frame) return 0;
				return await frame.evaluate(
					() => document.querySelectorAll("[data-puck-component]").length,
				);
			} catch {
				return 0;
			}
		};
		const readProbeInBrowser = async (): Promise<void> => {
			try {
				const handle = await pg
					.locator("iframe#preview-frame")
					.elementHandle({ timeout: 1000 });
				const frame = handle ? await handle.contentFrame() : null;
				if (!frame) return;
				// Scan the whole canvas for the sentinel rather than a
				// single component id — robust to how Puck wraps/labels
				// the rendered Button and to transient re-mounts.
				const text = await frame.evaluate((prefix: string) => {
					const i = document.body.innerText.indexOf(prefix);
					return i < 0 ? null : document.body.innerText.slice(i, i + 40);
				}, PROBE_PREFIX);
				if (!text) return;
				const i = text.indexOf(PROBE_PREFIX);
				if (i < 0) return;
				const stamp = Number.parseInt(text.slice(i + PROBE_PREFIX.length), 10);
				if (Number.isFinite(stamp) && stamp !== lastE2eStamp) {
					lastE2eStamp = stamp;
					e2eLatencies.push(Date.now() - stamp);
				}
			} catch {
				/* iframe transiently detached during dispatch — skip */
			}
		};

		// Wait for hydration (the encoding-compat gate).
		const gateDeadline = Date.now() + 90_000;
		let stable = 0;
		while (Date.now() < gateDeadline) {
			// `countHydrated` does an untimed `frame.evaluate`; if the
			// renderer is pinned mid-hydration it would never resolve and
			// the gate loop would hang past its own 90s deadline.
			const c = await withTimeout(
				countHydrated(),
				HYDRATION_CALL_TIMEOUT_MS,
				0,
			);
			maxHydrated = Math.max(maxHydrated, c);
			if (c >= NODE_COUNT * HYDRATION_GATE) {
				stable += 1;
				if (stable >= 2) {
					renderCompleteMs = Date.now() - navStart;
					gatePassed = true;
					break;
				}
			} else {
				stable = 0;
			}
			await new Promise((r) => setTimeout(r, 500));
		}
		console.log(
			gatePassed
				? `hydration gate PASSED — ${maxHydrated} nodes in ${renderCompleteMs} ms`
				: `hydration gate FAILED — peaked at ${maxHydrated}/${NODE_COUNT}`,
		);

		// Now that the browser has mounted and hydrated (or the gate
		// timed out), release the concurrent-edit firehose. From here
		// the sampling window measures real steady-state behaviour under
		// ${PEER_COUNT} editors, not render-vs-sync contention.
		for (const start of startEditTimers) start();
		console.log(`edit load started — ${startEditTimers.length} timers`);

		// 6. Sustained sampling loop under load. Ticks fast so the
		// poll-limited browser-visible latency has usable resolution;
		// heap/RSS are sampled on the slower SAMPLE_MS cadence.
		const PROBE_POLL_MS = 250;
		const runDeadline = Date.now() + RUN_DURATION_MS;
		let lastHeapAt = 0;
		let watchdogTrips = 0;
		while (Date.now() < runDeadline) {
			const now = Date.now();
			const elapsed = now - startedAt;
			if (now - lastHeapAt >= SAMPLE_MS) {
				lastHeapAt = now;
				const heap = await withTimeout(
					readHeap(),
					HEAP_CALL_TIMEOUT_MS,
					Number.NaN,
				);
				if (Number.isFinite(heap)) heapSamples.push([elapsed, heap]);
				else watchdogTrips += 1;
				rssSamples.push([elapsed, process.memoryUsage().rss]);
			}
			const probed = await withTimeout(
				readProbeInBrowser().then(() => true),
				PROBE_CALL_TIMEOUT_MS,
				false,
			);
			if (!probed) watchdogTrips += 1;
			await new Promise((r) => setTimeout(r, PROBE_POLL_MS));
		}

		// 7. Drain injected instrumentation. Also watchdog-bounded: a
		// pinned renderer makes `drainPerf`'s page.evaluate hang too, so
		// without this the report would never be written even though the
		// loop above exited cleanly.
		const perf = await withTimeout(drainPerf(pg), DRAIN_TIMEOUT_MS, EMPTY_PERF);
		// A run the watchdog had to rescue (instrumentation undrainable,
		// or many sampling calls timed out under a pinned renderer) is
		// honestly a degraded read — flag it so the figures aren't
		// quoted as a clean steady-state result.
		const watchdogDegraded =
			perf === EMPTY_PERF || watchdogTrips >= 5 || !gatePassed;
		writeReport({
			gatePassed,
			maxHydrated,
			renderCompleteMs,
			adapterLatencies,
			e2eLatencies,
			heapSamples,
			rssSamples,
			blocks: perf.blocks,
			heartbeatMs: perf.heartbeatMs,
			frames: perf.frames,
			longtasks: perf.longtasks,
			actualPeers: Math.max(0, peers.length - 3), // minus seed/observer/probe
			partial: watchdogDegraded,
		});
		if (watchdogDegraded) {
			console.log(
				`report written (watchdog-degraded: trips=${watchdogTrips}, drain=${perf === EMPTY_PERF ? "timed-out" : "ok"})`,
			);
		}
		reported = true;
	} finally {
		for (const t of timers) clearInterval(t);
		// Resilient reporting: if the load/measurement phase threw or was
		// killed mid-flight (e.g. the host could not sustain PEER_COUNT),
		// still emit a report with whatever was collected so the run is
		// never silently lost.
		if (!reported) {
			const perf = page
				? await withTimeout(drainPerf(page), DRAIN_TIMEOUT_MS, EMPTY_PERF)
				: EMPTY_PERF;
			try {
				writeReport({
					gatePassed,
					maxHydrated,
					renderCompleteMs,
					adapterLatencies,
					e2eLatencies,
					heapSamples,
					rssSamples,
					blocks: perf.blocks,
					heartbeatMs: perf.heartbeatMs,
					frames: perf.frames,
					longtasks: perf.longtasks,
					actualPeers: Math.max(0, peers.length - 3),
					partial: true,
				});
			} catch (e) {
				console.error("failed to write partial report:", e);
			}
		}
		if (browser) await browser.close().catch(() => undefined);
		for (const p of peers) {
			try {
				p.destroy();
			} catch {
				/* best-effort teardown */
			}
		}
		await stopRelay().catch(() => undefined);
	}
}

interface PerfBag {
	startedAt: number;
	heartbeatMs: number;
	blocks: number[];
	frames: number[];
	longtasks: Array<{ start: number; duration: number }>;
}

const EMPTY_PERF: PerfBag = {
	startedAt: 0,
	heartbeatMs: 100,
	blocks: [],
	frames: [],
	longtasks: [],
};

/**
 * Sampling watchdog. When the renderer main thread is pinned (the exact
 * high-load failure mode this benchmark exists to measure), Playwright
 * `evaluate`/`elementHandle` and CDP calls queue behind it and may
 * never resolve. Without a per-call deadline the sampling loop's
 * `while (Date.now() < runDeadline)` is never re-evaluated (it's stuck
 * inside an `await`), the 60s wall budget is silently ignored, and the
 * run hangs forever instead of writing a report — so a saturated
 * renderer (a real, reportable result) looked identical to a frozen
 * harness.
 *
 * Racing every page/CDP call against a wall-clock timer bounds each
 * loop iteration, so the loop always reaches the deadline and
 * `writeReport`. On timeout we resolve to `fallback` and move on; the
 * orphaned promise is neutralised so it can't surface later as an
 * unhandled rejection.
 */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const guard = new Promise<T>((resolve) => {
		timer = setTimeout(() => resolve(fallback), ms);
	});
	const tracked = p
		.then((v) => v)
		.catch(() => fallback)
		.finally(() => {
			if (timer !== undefined) clearTimeout(timer);
		});
	return Promise.race([tracked, guard]);
}

/** Per-call watchdog budgets (ms). Generous: only fire on a true wedge. */
const HEAP_CALL_TIMEOUT_MS = 4_000;
const PROBE_CALL_TIMEOUT_MS = 3_000;
const HYDRATION_CALL_TIMEOUT_MS = 5_000;
const DRAIN_TIMEOUT_MS = 8_000;

async function drainPerf(pg: import("playwright").Page): Promise<PerfBag> {
	try {
		return await pg.evaluate(
			() =>
				(window as unknown as { __perf?: PerfBag }).__perf ?? {
					startedAt: 0,
					heartbeatMs: 100,
					blocks: [],
					frames: [],
					longtasks: [],
				},
		);
	} catch {
		return EMPTY_PERF;
	}
}

function findProbeLabel(ir: PageIR): string | undefined {
	for (const child of ir.root.children ?? []) {
		if (child.id === PROBE_NODE_ID) {
			const label = (child.props as { label?: unknown }).label;
			return typeof label === "string" && label.startsWith(PROBE_PREFIX)
				? label
				: undefined;
		}
	}
	return undefined;
}

// ---------------------------------------------------------------- report
interface ReportInput {
	gatePassed: boolean;
	maxHydrated: number;
	renderCompleteMs: number;
	adapterLatencies: number[];
	e2eLatencies: number[];
	heapSamples: Array<[number, number]>;
	rssSamples: Array<[number, number]>;
	blocks: number[];
	heartbeatMs: number;
	frames: number[];
	longtasks: Array<{ start: number; duration: number }>;
	actualPeers: number;
	partial?: boolean;
}

function writeReport(r: ReportInput): void {
	const JANK_MS = 50;
	const FREEZE_MS = 200;
	const runMin = RUN_DURATION_MS / 60_000;

	// Primary jank signal: setInterval heartbeat excess (headless-safe).
	// A block sample is the ms the main thread was unavailable beyond
	// the expected heartbeat gap in that ~100ms window.
	const jankBlocks = r.blocks.filter((d) => d > JANK_MS);
	const freezeBlocks = r.blocks.filter((d) => d > FREEZE_MS);
	const worstBlock = r.blocks.length ? Math.max(...r.blocks) : Number.NaN;
	const totalBlockedMs = r.blocks.reduce((acc, d) => acc + Math.max(0, d), 0);

	// Supplementary rAF signal (usually empty headless).
	const jank = r.frames.filter((d) => d > JANK_MS);
	const freezes = r.frames.filter((d) => d > FREEZE_MS);
	const worstFrame = r.frames.length ? Math.max(...r.frames) : Number.NaN;
	// Total Blocking Time: sum of (longtask − 50ms) over all long tasks.
	const tbt = r.longtasks.reduce(
		(acc, t) => acc + Math.max(0, t.duration - 50),
		0,
	);

	const heapVals = r.heapSamples.map((s) => s[1]);
	const heapXs = r.heapSamples.map((s) => s[0]);
	const rssVals = r.rssSamples.map((s) => s[1]);
	const rssXs = r.rssSamples.map((s) => s[0]);
	const heapSlopePerMin = slope(heapXs, heapVals) * 60_000;
	const rssSlopePerMin = slope(rssXs, rssVals) * 60_000;

	const lines: string[] = [];
	const p = (s: string) => lines.push(s);

	p("# plugin-collab-yjs — High-Load Performance Report");
	p("");
	p(`Generated: ${new Date().toISOString()}`);
	p("");
	if (r.partial) {
		p(
			"> ⚠️ **PARTIAL RUN.** The load/measurement phase aborted before " +
				"completing (most likely the host could not sustain the " +
				`requested ${PEER_COUNT} peers × ${NODE_COUNT}-node docs in one ` +
				"process — Risk #3). Figures below reflect only what was " +
				`collected with **${Math.max(0, r.actualPeers)}** peers actually ` +
				"connected. Re-run with a lower `PEER_COUNT`.",
		);
		p("");
	}
	p("## Scenario");
	p("");
	p("| Parameter | Value |");
	p("| --- | --- |");
	p(`| Document size | ${NODE_COUNT} nodes (Button) |`);
	p(`| Collaborator peers | ${r.actualPeers} (requested ${PEER_COUNT}) |`);
	p(`| Per-peer edit rate | 1 edit / ${EDIT_RATE_MS} ms |`);
	p(`| Probe cadence | 1 / ${PROBE_RATE_MS} ms |`);
	p(`| Load duration | ${(RUN_DURATION_MS / 1000).toFixed(0)} s |`);
	p(`| Browser | headless Chromium (Playwright) |`);
	p("");

	p("## 1. Node rendering completion time");
	p("");
	if (r.gatePassed) {
		p(
			`**${ms(r.renderCompleteMs)}** — navigation → ≥${Math.round(
				HYDRATION_GATE * 100,
			)}% of ${NODE_COUNT} nodes rendered & stable in the canvas ` +
				`(${r.maxHydrated} \`[data-puck-component]\` nodes observed).`,
		);
	} else {
		p(
			`**GATE FAILED.** The browser peaked at **${r.maxHydrated}/${NODE_COUNT}** ` +
				"rendered nodes within 90 s and never stabilized. Either 2000 real " +
				"component renders exceed what the editor sustains, or the seed " +
				"peer's `createYjsAdapter` encoding does not match the browser's " +
				"`createCollabPlugin` adapter (native-tree / map-name). Latency and " +
				"jank figures below are reported for the partial state only and must " +
				"NOT be read as a clean 2000-node result.",
		);
	}
	p("");

	p("## 2. Synchronization latency (collaborator action → observed)");
	p("");
	p("| Path | p50 | p95 | max | mean | samples |");
	p("| --- | --- | --- | --- | --- | --- |");
	p(
		`| Adapter layer (observer peer) | ${ms(pct(r.adapterLatencies, 50))} | ` +
			`${ms(pct(r.adapterLatencies, 95))} | ${ms(
				r.adapterLatencies.length ? Math.max(...r.adapterLatencies) : NaN,
			)} | ${ms(mean(r.adapterLatencies))} | ${r.adapterLatencies.length} |`,
	);
	p(
		`| Browser end-to-end (poll-limited) | ${ms(pct(r.e2eLatencies, 50))} | ` +
			`${ms(pct(r.e2eLatencies, 95))} | ${ms(
				r.e2eLatencies.length ? Math.max(...r.e2eLatencies) : NaN,
			)} | ${ms(mean(r.e2eLatencies))} | ${r.e2eLatencies.length} |`,
	);
	p("");
	p(
		"_Adapter-layer is the precise number: relay round-trip + native-tree " +
			"decode — the same code path the browser's adapter runs. Browser " +
			"end-to-end is polled every ~250 ms so its resolution is " +
			"bounded by that interval; treat it as directional._",
	);
	p("");

	p("## 3. UI lag / freeze frequency");
	p("");
	p(
		"Primary signal: a 100ms `setInterval` heartbeat injected into the " +
			"editor. Excess gap between ticks = time the main thread was " +
			"blocked (what the user perceives as stutter/freeze). This is " +
			"headless-safe; rAF is parked headless and shown only if captured.",
	);
	p("");
	p("| Metric | Value |");
	p("| --- | --- |");
	p(`| Heartbeat samples | ${r.blocks.length} (${r.heartbeatMs}ms target) |`);
	p(
		`| Jank events (block >${JANK_MS} ms) | ${jankBlocks.length} (${(
			jankBlocks.length / Math.max(runMin, 0.01)
		).toFixed(1)}/min) |`,
	);
	p(
		`| Freeze events (block >${FREEZE_MS} ms) | ${freezeBlocks.length} (${(
			freezeBlocks.length / Math.max(runMin, 0.01)
		).toFixed(1)}/min) |`,
	);
	p(`| Worst single block | ${ms(worstBlock)} |`);
	p(`| Total blocked time | ${ms(totalBlockedMs)} |`);
	if (r.frames.length > 0) {
		p(
			`| rAF jank frames (>${JANK_MS} ms) | ${jank.length} ` +
				`(worst ${ms(worstFrame)}, ${freezes.length} >${FREEZE_MS}ms) |`,
		);
	}
	p("");

	p("## 4. Frame drops & blocking incidents (Long Tasks API)");
	p("");
	p(
		"Corroborating signal from the Long Tasks API (works headless). " +
			"Total Blocking Time = Σ(task − 50ms); each long task is a frame " +
			"the compositor could not produce.",
	);
	p("");
	p("| Metric | Value |");
	p("| --- | --- |");
	p(`| Long tasks observed | ${r.longtasks.length} |`);
	p(`| Total Blocking Time | ${ms(tbt)} |`);
	p(
		`| Longest task | ${ms(
			r.longtasks.length
				? Math.max(...r.longtasks.map((t) => t.duration))
				: NaN,
		)} |`,
	);
	p("");

	p("## 5. Memory usage trend");
	p("");
	p("| Series | start | peak | end | slope |");
	p("| --- | --- | --- | --- | --- |");
	if (heapVals.length) {
		p(
			`| Browser JS heap | ${mib(heapVals[0] as number)} | ${mib(
				Math.max(...heapVals),
			)} | ${mib(heapVals[heapVals.length - 1] as number)} | ${
				Number.isFinite(heapSlopePerMin)
					? `${(heapSlopePerMin / 1024 / 1024).toFixed(2)} MiB/min`
					: "n/a"
			} |`,
		);
	} else {
		p("| Browser JS heap | n/a | n/a | n/a | n/a |");
	}
	if (rssVals.length) {
		p(
			`| Node peers RSS | ${mib(rssVals[0] as number)} | ${mib(
				Math.max(...rssVals),
			)} | ${mib(rssVals[rssVals.length - 1] as number)} | ${
				Number.isFinite(rssSlopePerMin)
					? `${(rssSlopePerMin / 1024 / 1024).toFixed(2)} MiB/min`
					: "n/a"
			} |`,
		);
	}
	p("");
	p(
		"_A near-zero slope indicates no leak under sustained load. A clearly " +
			"positive heap slope sustained past warm-up is the signal to chase._",
	);
	p("");

	p("## 6. Summary & caveats");
	p("");
	p(
		`- Avg operation latency (adapter layer): **${ms(
			mean(r.adapterLatencies),
		)}** across ${r.adapterLatencies.length} probe round-trips under ` +
			`${r.actualPeers} concurrent editors.`,
	);
	p(
		`- Blocking incidents: **${freezeBlocks.length}** freezes >${FREEZE_MS} ms ` +
			`(heartbeat), worst block **${ms(worstBlock)}**; Long-Tasks Total ` +
			`Blocking Time **${ms(tbt)}** over ${(RUN_DURATION_MS / 1000).toFixed(
				0,
			)} s.`,
	);
	p("- Caveats (read before acting on these numbers):");
	p(
		"  1. **1 real browser + N headless peers.** True 100-thread concurrency " +
			"is impossible in one process; headless interleaved writes are a " +
			"faithful proxy for the relay/CRDT/dispatch paths, not for 100 real " +
			"browsers' render cost.",
	);
	p(
		`  2. Actual peer count was **${r.actualPeers}** (requested ${PEER_COUNT}). ` +
			"If lower than requested, the host could not sustain the sockets/docs " +
			"— scale figures accordingly.",
	);
	p(
		"  3. Node `Date.now()` (peer stamp) vs browser/observer clock is " +
			"sub-millisecond on one host — fine for relative latency.",
	);
	p(
		"  4. Headless Chromium frame timing differs from headed; the " +
			"heartbeat is the headless-safe jank signal (rAF is parked).",
	);
	p(
		"  5. **Browser end-to-end latency may read `n/a`.** The plugin's " +
			"H1 inbound scheduler flushes remote updates on " +
			"`requestAnimationFrame`, which headless Chromium parks — so " +
			"post-hydration repaints (and the visible probe) may never land " +
			"headless even though the relay/adapter deliver them on time " +
			"(see the adapter-layer number, which is the real sync latency). " +
			"To capture browser-visible latency, run headed under Xvfb: " +
			"`xvfb-run -a pnpm bench:collab-highload` with a headed launch.",
	);
	if (!r.gatePassed) {
		p(
			"  6. **Hydration gate failed** — every figure above reflects a " +
				"partial document; do not quote them as a 2000-node result.",
		);
	}
	p("");

	const out = lines.join("\n");
	writeFileSync(REPORT_PATH, `${out}\n`);
	console.log(`\n${out}\n`);
	console.log(`report written → ${REPORT_PATH}`);
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
