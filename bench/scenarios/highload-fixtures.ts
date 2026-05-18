/**
 * Fixtures + injected instrumentation for the `plugin-collab-yjs`
 * high-load scenario (`collab-yjs-highload.ts`).
 *
 * Kept dependency-free on purpose: the orchestrator already pulls in
 * `@anvilkit/plugin-collab-yjs`, `yjs`, `y-websocket` and `playwright`.
 * The 2000-node document is built from a hardcoded `Button` prop bag
 * (mirrors `@anvilkit/button`'s `defaultProps`) so this file doesn't
 * import a component package — that would drag the CSS-shim loader in
 * for no benefit.
 */
import type { PageIR, PageIRNode } from "@anvilkit/core/types";

/**
 * Mirrors `@anvilkit/button`'s `defaultProps`
 * (`packages/components/src/button/src/config.ts`). The 2000-node doc
 * is all `Button`s because it is the cheapest registered demo
 * component to render 2000× in the real editor — every node is a
 * single `<button>`/`<a>`, no nested slots, no images.
 */
export const BUTTON_DEFAULT_PROPS = {
	label: "Save changes",
	variant: "primary",
	disabled: false,
	href: "",
	openInNewTab: false,
} as const;

/** Node id whose `label` the probe peer stamps with a timestamp. */
export const PROBE_NODE_ID = "n-probe";

/** Sentinel prefix the browser/observer scans for to time sync. */
export const PROBE_PREFIX = "__probe:";

export interface BuiltDoc {
	readonly ir: PageIR;
	/** Ids of the editable (collaborator-mutated) nodes, in order. */
	readonly editableIds: readonly string[];
}

/**
 * Build a `PageIR` of `count` `Button` nodes plus one dedicated probe
 * node. `irToPuckData()` turns each child into a Puck content item
 * `{ type: "Button", props: { id, label, … } }`, which the demo's
 * `createCollabPlugin()` renders in the canvas iframe tagged with
 * `data-puck-component="<id>"`.
 */
export function make2000NodeIR(count: number): BuiltDoc {
	const editableIds: string[] = [];
	const children: PageIRNode[] = [];

	for (let i = 0; i < count; i += 1) {
		const id = `n-${i}`;
		editableIds.push(id);
		children.push({
			id,
			type: "Button",
			props: { ...BUTTON_DEFAULT_PROPS, label: `Button ${i}` },
		});
	}

	// Dedicated probe node lives at the end so collaborator edits to
	// `n-0..n-(count-1)` never collide with the latency sentinel.
	children.push({
		id: PROBE_NODE_ID,
		type: "Button",
		props: { ...BUTTON_DEFAULT_PROPS, label: "probe-idle" },
	});

	const ir: PageIR = {
		version: "1",
		root: { id: "root", type: "Root", props: {}, children },
		assets: [],
		metadata: {},
	};

	return { ir, editableIds };
}

/**
 * Return a shallow structural clone of `ir` with a single node's
 * `label` replaced. Only the touched node and the spine to it are
 * re-allocated — keeps the per-edit cost dominated by the adapter's
 * encode + native-tree apply, not by fixture churn.
 */
export function withNodeLabel(
	ir: PageIR,
	nodeId: string,
	label: string,
): PageIR {
	const children = (ir.root.children ?? []).map((child) =>
		child.id === nodeId
			? { ...child, props: { ...child.props, label } }
			: child,
	);
	return { ...ir, root: { ...ir.root, children } };
}

/**
 * Allocation-lean variant of {@link withNodeLabel} for the hot edit
 * loop. Builds the `{root,children}` spine **once** per peer (children
 * array reused across ticks, every sibling object shared by reference);
 * each tick only swaps in a fresh `{...props,label}` for the one owned
 * node. With dozens of peers each saving twice a second over a
 * 2000-node doc, re-`map()`-ing the array every tick is the dominant
 * GC pressure — this removes it.
 */
export function makeNodeLabelMutator(
	ir: PageIR,
	nodeId: string,
): (label: string) => PageIR {
	const srcChildren = ir.root.children ?? [];
	const idx = srcChildren.findIndex((c) => c.id === nodeId);
	const children = srcChildren.slice();
	const target = srcChildren[idx];
	const root = { ...ir.root, children };
	const next: PageIR = { ...ir, root };
	return (label: string) => {
		if (idx >= 0 && target) {
			children[idx] = { ...target, props: { ...target.props, label } };
		}
		return next;
	};
}

/**
 * Injected via `page.addInitScript` BEFORE navigation. Accumulates
 * main-thread health into `window.__perf`:
 *
 * - `frames`  — inter-frame deltas (ms) from a self-rescheduling rAF
 *   loop. A delta well above ~16.7ms means a frame the user would
 *   perceive as stutter; a large delta is a visible freeze.
 * - `longtasks` — `{ start, duration }` from the Long Tasks
 *   PerformanceObserver. Present in modern headless Chromium; the rAF
 *   sampler is the robust fallback if the entry type is unsupported.
 *
 * A `setInterval` "heartbeat" is the PRIMARY jank signal: headless
 * Chromium parks `requestAnimationFrame` (which also gates the
 * plugin's H1 inbound scheduler), so rAF deltas are often empty
 * headless. Timers keep running with the anti-throttle launch flags,
 * so the gap between successive 100ms ticks minus 100ms is real
 * main-thread blocking the user would perceive as stutter/freeze.
 *
 * Heap is NOT sampled here — the orchestrator reads
 * `Performance.getMetrics` over CDP instead (more reliable than
 * `performance.memory`, which is gated/quantized).
 */
export const INSTRUMENTATION = String.raw`
(() => {
  if (window.__perf) return;
  var HEARTBEAT_MS = 100;
  const perf = {
    startedAt: Date.now(),
    heartbeatMs: HEARTBEAT_MS,
    blocks: [],
    frames: [],
    longtasks: [],
  };
  window.__perf = perf;

  // Primary jank signal: excess wall-time between fixed-interval
  // ticks = time the main thread was blocked in that window.
  let prev = performance.now();
  setInterval(() => {
    const now = performance.now();
    perf.blocks.push(now - prev - HEARTBEAT_MS);
    prev = now;
  }, HEARTBEAT_MS);

  let last = performance.now();
  function tick(now) {
    perf.frames.push(now - last);
    last = now;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame((now) => { last = now; requestAnimationFrame(tick); });

  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        perf.longtasks.push({ start: e.startTime, duration: e.duration });
      }
    });
    obs.observe({ type: "longtask", buffered: true });
  } catch {
    /* longtask entry type unsupported — rAF deltas still cover jank */
  }
})();
`;
