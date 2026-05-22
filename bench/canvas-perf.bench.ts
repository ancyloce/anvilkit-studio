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
import type {
	CanvasAiPlaceholderNode,
	CanvasIR,
	CanvasNode,
} from "@anvilkit/canvas-core";
import { createAiJobStore } from "@anvilkit/canvas-editor/stores/ai-job-store";
import { createViewportStore } from "@anvilkit/canvas-editor/stores/viewport-store";
import type { BenchResult } from "./types.js";

const NODE_COUNTS = [100, 500, 1000] as const;

/**
 * Steps in a simulated drag gesture. A single `node.move` apply is sub-0.1ms
 * even at 1000 nodes (below the harness `NOISE_FLOOR_MS`, so ungated); a
 * gesture aggregates ~1s of 60fps pointer-driven moves into a gateable number
 * and is the more honest "what does dragging in a large scene cost" signal.
 */
const DRAG_STEPS = 60;

/** AI-placeholder lifecycles created + resolved per churn iteration. */
const CHURN_COUNT = 100;

/** setPan/setZoom pairs applied per viewport-pan iteration. */
const PAN_STEPS = 200;

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

	// ai-churn:K — create + register + resolve K ai-placeholder lifecycles. Each
	// iteration starts from a fresh empty IR and threads the immutable IR through
	// create (node.create) then resolve (node.update status → "complete"),
	// alongside the ai-job-store register/complete cycle — the cost of an AI
	// batch landing then settling on the canvas.
	bench.add(`canvas:ai-churn:${CHURN_COUNT}`, () => {
		const store = createAiJobStore();
		let ir = createCanvasIR({ id: "churn-ir" });
		const pageId = ir.pages[0]?.id ?? "";
		for (let i = 0; i < CHURN_COUNT; i += 1) {
			const node: CanvasAiPlaceholderNode = {
				id: `ph-${i}`,
				type: "ai-placeholder",
				transform: {
					x: (i % 10) * 110,
					y: Math.floor(i / 10) * 110,
					rotation: 0,
					scaleX: 1,
					scaleY: 1,
				},
				bounds: { width: 100, height: 100 },
				zIndex: 0,
				jobId: `job-${i}`,
				status: "pending",
			};
			ir = applyCommand(ir, { type: "node.create", node, pageId }).ir;
			store.getState().register(`job-${i}`, {
				nodeId: node.id,
				abort: () => undefined,
			});
		}
		for (let i = 0; i < CHURN_COUNT; i += 1) {
			store.getState().complete(`job-${i}`);
			ir = applyCommand(ir, {
				type: "node.update",
				nodeId: `ph-${i}`,
				kind: "ai-placeholder",
				patch: { status: "complete" },
			}).ir;
		}
	});

	// pan:viewport — store throughput for a pan/zoom burst. O(1) per set, so this
	// stays sub-floor (recorded, ungated) — the real pan cost is the Konva
	// re-render, which is render-bound and lives outside this headless harness.
	bench.add("canvas:pan:viewport", () => {
		const store = createViewportStore();
		for (let i = 0; i < PAN_STEPS; i += 1) {
			store.getState().setPan(i * 3, i * 2);
			store.getState().setZoom(1 + (i % 50) * 0.01);
		}
	});

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
