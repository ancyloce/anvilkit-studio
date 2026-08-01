"use client";

/**
 * @file The development performance overlay (PLAN-0020 CORE-P4-002;
 * DD-0019 §28 "The development performance overlay reports node and
 * registry counts, command duration, resolver cache hit rate,
 * observer batch size, iframe document generation, and tasks longer
 * than 50 ms").
 *
 * **Never ships to production.** It is reached only through the lazy
 * `import()` in `EditorRoot`, guarded by {@link perfOverlayEnabled} —
 * which requires an explicit non-production `NODE_ENV` *and* an
 * explicit opt-in (`?akPerf=1` or `window.__ANVILKIT_EDITOR_PERF__`).
 * `check-bundle-budget.mjs` asserts the marker string below is absent
 * from both the `<Studio>` entry chunk and the chrome chunk, so a
 * regression that pulls it eagerly fails CI rather than shipping.
 *
 * Counts are sampled, not subscribed, for the two rows that would
 * otherwise force a render on every Puck change: node count and
 * registry count are read on a timer. A dev overlay that re-renders
 * the editor on every mutation would distort the very numbers it
 * exists to report.
 */

import {
	type ReactNode,
	useEffect,
	useState,
	useSyncExternalStore,
} from "react";
import { useMsg } from "@/state/editor-i18n-context";
import type { StudioEditorBridge } from "../bridge.js";
import type { InternalEditorCommandPort } from "../command-port.js";
import type { EditorPerfMetrics, EditorPerfSnapshot } from "./perf-metrics.js";

/**
 * Marker string asserted **absent** from the entry and chrome chunks
 * by `check-bundle-budget.mjs`. Keep it in sync with that script.
 */
export const PERF_OVERLAY_MARKER = "ak-editor-perf-overlay";

/** How often the sampled (non-event-driven) rows refresh. */
const SAMPLE_INTERVAL_MS = 1_000;

/** Props for the overlay. */
export interface PerfOverlayProps {
	readonly bridge: StudioEditorBridge;
	readonly metrics: EditorPerfMetrics;
}

interface SampledCounts {
	readonly nodeCount: number;
	readonly registryCount: number;
}

const EMPTY_COUNTS: SampledCounts = { nodeCount: 0, registryCount: 0 };

/** The dev-only §28 overlay. */
export default function PerfOverlay({
	bridge,
	metrics,
}: PerfOverlayProps): ReactNode {
	const msg = useMsg();
	const snapshot = useSyncExternalStore(
		metrics.subscribe,
		metrics.getSnapshot,
		metrics.getSnapshot,
	);
	const [counts, setCounts] = useState<SampledCounts>(EMPTY_COUNTS);
	const [collapsed, setCollapsed] = useState(false);

	useEffect(() => {
		const sample = (): void => {
			const port = bridge.port as InternalEditorCommandPort | null;
			let nodeCount = 0;
			try {
				nodeCount = port === null ? 0 : countTreeNodes(port.readData());
			} catch {
				// A port mid-teardown must not crash a diagnostic overlay.
				nodeCount = 0;
			}
			const registryCount = bridge.canvasRegistry?.listNodeIds().length ?? 0;
			setCounts((previous) =>
				previous.nodeCount === nodeCount &&
				previous.registryCount === registryCount
					? previous
					: { nodeCount, registryCount },
			);
		};
		sample();
		const timer = setInterval(sample, SAMPLE_INTERVAL_MS);
		return () => {
			clearInterval(timer);
		};
	}, [bridge]);

	const rows = buildRows(msg, snapshot, counts);

	return (
		<aside
			data-testid={PERF_OVERLAY_MARKER}
			aria-label={msg("studio.editor.perf.title")}
			// Editor-chrome tokens + the shared floating elevation, matching
			// `ActionBar` and `SelectionToolbar` — this used generic shadcn
			// surfaces and Tailwind's `shadow-lg`, making it the third
			// distinct elevation treatment among the studio's floating panels.
			className="pointer-events-auto fixed bottom-2 right-2 z-[9999] max-w-xs rounded-md border border-[var(--ak-studio-border)] bg-[var(--editor-panel-raised)]/95 p-2 font-mono text-[11px] leading-tight text-[var(--ak-studio-panel-fg)] shadow-[var(--shadow-floating)]"
		>
			<div className="flex items-center justify-between gap-2">
				<strong className="font-semibold">
					{msg("studio.editor.perf.title")}
				</strong>
				<button
					type="button"
					className="rounded px-1 text-[var(--ak-studio-muted-fg)] transition-colors hover:text-[var(--ak-studio-fg)]"
					onClick={() => setCollapsed((value) => !value)}
					data-testid="ak-editor-perf-toggle"
				>
					{collapsed
						? msg("studio.editor.perf.expand")
						: msg("studio.editor.perf.collapse")}
				</button>
			</div>
			{collapsed ? null : (
				<dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
					{rows.map((row) => (
						<div key={row.key} className="contents">
							<dt className="text-muted-foreground">{row.label}</dt>
							<dd className="text-right tabular-nums" data-perf-row={row.key}>
								{row.value}
							</dd>
						</div>
					))}
				</dl>
			)}
		</aside>
	);
}

interface OverlayRow {
	readonly key: string;
	readonly label: string;
	readonly value: string;
}

function buildRows(
	msg: (key: string, fallback?: string) => string,
	snapshot: EditorPerfSnapshot,
	counts: SampledCounts,
): readonly OverlayRow[] {
	const dash = "—";
	const ms = (value: number | null): string =>
		value === null ? dash : `${value.toFixed(1)} ms`;
	return [
		{
			key: "nodes",
			label: msg("studio.editor.perf.nodes"),
			value: String(counts.nodeCount),
		},
		{
			key: "registry",
			label: msg("studio.editor.perf.registry"),
			value: String(counts.registryCount),
		},
		{
			key: "command",
			label: msg("studio.editor.perf.command"),
			value: `${ms(snapshot.lastCommandMs)} / p95 ${ms(snapshot.p95CommandMs)} (${snapshot.commandCount})`,
		},
		{
			key: "resolver-cache",
			label: msg("studio.editor.perf.resolverCache"),
			value:
				snapshot.resolverCacheHitRate === null
					? dash
					: `${Math.round(snapshot.resolverCacheHitRate * 100)}% (${snapshot.resolverCacheHits}/${
							snapshot.resolverCacheHits + snapshot.resolverCacheMisses
						})`,
		},
		{
			key: "observer",
			label: msg("studio.editor.perf.observerBatch"),
			value:
				snapshot.lastObserverBatch === null
					? dash
					: `${snapshot.lastObserverBatch} / max ${snapshot.maxObserverBatch}`,
		},
		{
			key: "iframe-doc",
			label: msg("studio.editor.perf.iframeDocuments"),
			value: String(snapshot.iframeDocumentGenerations),
		},
		{
			key: "long-tasks",
			label: msg("studio.editor.perf.longTasks"),
			// A browser without the `longtask` entry type reports
			// "unsupported", never a zero that reads as "no long tasks".
			value: snapshot.longTasksObserved
				? `${snapshot.longTaskCount} / max ${snapshot.maxLongTaskMs.toFixed(0)} ms`
				: msg("studio.editor.perf.unsupported"),
		},
	];
}

/** Count every node in the Puck tree (content plus all zones). */
function countTreeNodes(data: unknown): number {
	const doc = data as {
		content?: readonly unknown[];
		zones?: Record<string, readonly unknown[]>;
	} | null;
	if (doc === null || typeof doc !== "object") {
		return 0;
	}
	let total = doc.content?.length ?? 0;
	for (const zone of Object.values(doc.zones ?? {})) {
		total += zone.length;
	}
	return total;
}
