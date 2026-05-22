/**
 * I2-4 — canvas perf scenarios.
 *
 * Headless tinybench coverage for the `@anvilkit/canvas-core` data model at
 * scale (dev plan I2-4; PRD §7 Phase 6 perf slice). Establishes the baseline
 * the I2-5 perf pass must beat. NO DOM / NO Konva — exercises only the pure IR
 * builders + the immutable command reducer (`applyCommand`). Later scenarios
 * (ai-churn / pan) add the two zustand/vanilla stores that survive in Node,
 * imported via deep subpaths to avoid the react-konva barrel.
 *
 * Scenarios:
 *  - canvas:build:{N}  construct an N-node IR (builder cost vs node count)
 *  - canvas:drag:{N}   one `node.move` against a node inside a prebuilt N-node
 *                      scene (immutable clone+mutate cost vs scene size — the
 *                      gate-worthy signal a drag gesture pays per committed move)
 */
import { Bench } from "tinybench";
import {
	applyCommand,
	createCanvasIR,
	createGroup,
	createPage,
	createRect,
} from "@anvilkit/canvas-core";
import type { CanvasIR, CanvasNode } from "@anvilkit/canvas-core";
import type { BenchResult } from "./types.js";

const NODE_COUNTS = [100, 500, 1000] as const;

/**
 * Steps in a simulated drag gesture. A single `node.move` apply is sub-0.1ms
 * even at 1000 nodes (below the harness `NOISE_FLOOR_MS`, so ungated); a
 * gesture aggregates ~1s of 60fps pointer-driven moves into a gateable number
 * and is the more honest "what does dragging in a large scene cost" signal.
 */
const DRAG_STEPS = 60;

/** Build an IR whose single page's root group holds `count` rect children. */
function buildScene(count: number): CanvasIR {
	const children: CanvasNode[] = [];
	for (let i = 0; i < count; i += 1) {
		children.push(
			createRect({
				id: `rect-${i}`,
				bounds: { width: 50, height: 50 },
				transform: { x: (i % 40) * 60, y: Math.floor(i / 40) * 60 },
				fill: "#cccccc",
			}),
		);
	}
	const root = createGroup({
		id: "root",
		bounds: { width: 1920, height: 1080 },
		children,
	});
	const page = createPage({ id: "page-1", root });
	return createCanvasIR({ id: "bench-ir", pages: [page] });
}

export async function runCanvasPerfBench(): Promise<BenchResult[]> {
	const bench = new Bench({ time: 1000, warmupTime: 150 });

	// build:N — pure construction cost. Fresh IR every iteration.
	for (const n of NODE_COUNTS) {
		bench.add(`canvas:build:${n}`, () => {
			buildScene(n);
		});
	}

	// drag:N — a sustained DRAG_STEPS-move gesture against a prebuilt N-node
	// scene, threading the immutable IR (each apply clones the page, so cost is
	// DRAG_STEPS × O(n)). The base scene is built once; `applyCommand` never
	// mutates it, so every iteration starts from the same state.
	for (const n of NODE_COUNTS) {
		const scene = buildScene(n);
		bench.add(`canvas:drag:${n}`, () => {
			let ir = scene;
			for (let step = 1; step <= DRAG_STEPS; step += 1) {
				ir = applyCommand(ir, {
					type: "node.move",
					nodeId: "rect-0",
					from: { x: step - 1, y: step - 1 },
					to: { x: step, y: step },
				}).ir;
			}
		});
	}

	await bench.run();

	return bench.tasks.flatMap((task) => {
		if (!task.result || !task.result.latency) return [];
		return [
			{
				name: task.name,
				meanMs: task.result.latency.mean,
				hz: task.result.hz,
			},
		];
	});
}
