/**
 * plugin-collab-yjs high-load bench (review 2026-05-17).
 *
 * Three pure-data tasks on a 2000-node document — no React, no jsdom:
 *
 * - `collab-yjs:local-save:2000` — `adapter.save()` after a single
 *   prop edit. Exercises encode + incremental native-tree apply +
 *   live-IR seed (the local keystroke path, H3).
 * - `collab-yjs:remote-apply:2000` — a remote peer's single-prop save
 *   shuttled into a second doc, driving the tree observer's
 *   incremental live-IR reconstruction + subscriber emit (H1/H3
 *   inbound path).
 * - `collab-yjs:offline-compact:2000` — `Y.mergeUpdatesV2` over a
 *   backlog of raw updates (M6 offline compaction).
 */
import { Bench } from "tinybench";

import { createYjsAdapter } from "@anvilkit/plugin-collab-yjs";
import type { PageIR } from "@anvilkit/core/types";
import * as Y from "yjs";

import type { BenchResult } from "./types.js";

const NODE_COUNT = 2000;

function make2000NodeIR(): PageIR {
	const children = Array.from({ length: NODE_COUNT }, (_, i) => ({
		id: `n-${i}`,
		type: "Block",
		props: { title: `Block ${i}`, index: i },
	}));
	return {
		version: "1",
		root: { id: "root", type: "Root", props: {}, children },
		assets: [],
		metadata: {},
	} as PageIR;
}

function mutateOneProp(ir: PageIR, counter: number): PageIR {
	const next = JSON.parse(JSON.stringify(ir)) as PageIR;
	const target = (next.root.children as { props: Record<string, unknown> }[])[
		counter % NODE_COUNT
	];
	if (target) target.props.title = `Block ${counter}-edited`;
	return next;
}

function taskResult(bench: Bench, prefix: string, name: string): BenchResult {
	const task = bench.tasks.find((t) => t.name.startsWith(prefix));
	const result = task?.result;
	if (!result?.latency) {
		throw new Error(`${name} bench produced no result`);
	}
	return { name, meanMs: result.latency.mean, hz: result.hz };
}

export async function runCollabYjsBench(): Promise<BenchResult[]> {
	const base = make2000NodeIR();

	// --- local save ---
	const localDoc = new Y.Doc();
	const localAdapter = createYjsAdapter({
		doc: localDoc,
		peer: { id: "bench-local" },
	});
	localAdapter.save(base, {});
	let localCounter = 0;
	const localBench = new Bench({ time: 500, warmupTime: 100 });
	localBench.add("collab-yjs:local-save:2000", () => {
		localCounter += 1;
		localAdapter.save(mutateOneProp(base, localCounter), {});
	});
	await localBench.run();
	localAdapter.destroy();

	// --- remote apply ---
	const docA = new Y.Doc();
	const docB = new Y.Doc();
	const adapterA = createYjsAdapter({ doc: docA, peer: { id: "bench-a" } });
	const adapterB = createYjsAdapter({ doc: docB, peer: { id: "bench-b" } });
	let emitted = 0;
	adapterA.subscribe(() => {
		emitted += 1;
	});
	adapterB.save(base, {});
	Y.applyUpdateV2(docA, Y.encodeStateAsUpdateV2(docB), { id: "bench-seed" });
	let remoteCounter = 0;
	const remoteBench = new Bench({ time: 500, warmupTime: 100 });
	remoteBench.add("collab-yjs:remote-apply:2000", () => {
		remoteCounter += 1;
		const sv = Y.encodeStateVector(docA);
		adapterB.save(mutateOneProp(base, remoteCounter), {});
		const update = Y.encodeStateAsUpdateV2(docB, sv);
		Y.applyUpdateV2(docA, update, { id: "bench-remote" });
	});
	await remoteBench.run();
	void emitted;
	adapterA.destroy();
	adapterB.destroy();

	// --- offline compaction ---
	const compactDoc = new Y.Doc();
	const compactMap = compactDoc.getMap<string>("m");
	const updates: Uint8Array[] = [];
	for (let i = 0; i < 500; i += 1) {
		const before = Y.encodeStateVector(compactDoc);
		compactMap.set(`k-${i}`, `v-${i}`);
		updates.push(Y.encodeStateAsUpdateV2(compactDoc, before));
	}
	const compactBench = new Bench({ time: 500, warmupTime: 100 });
	compactBench.add("collab-yjs:offline-compact:2000", () => {
		Y.mergeUpdatesV2(updates);
	});
	await compactBench.run();

	return [
		taskResult(
			localBench,
			"collab-yjs:local-save",
			"collab-yjs:local-save:2000",
		),
		taskResult(
			remoteBench,
			"collab-yjs:remote-apply",
			"collab-yjs:remote-apply:2000",
		),
		taskResult(
			compactBench,
			"collab-yjs:offline-compact",
			"collab-yjs:offline-compact:2000",
		),
	];
}
