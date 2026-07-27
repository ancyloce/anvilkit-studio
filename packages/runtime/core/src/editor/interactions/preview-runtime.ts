/**
 * @file Preview-mode runtime lifecycle (PLAN-0020 CORE-P3-002;
 * ED-MOTION-002; DD-0019 §16).
 *
 * §16: "Design mode prioritizes selection and does not run
 * interactions. … Exiting preview disposes timers, observers,
 * animations, and temporary variant state."
 *
 * Both halves of that are lifecycle problems, not rendering problems,
 * so they live here as a framework-agnostic session rather than
 * inside a component. A React hook drives it; the rules stay
 * testable without a renderer.
 *
 * ### Why a registry instead of ad-hoc cleanup
 *
 * Every resource an interaction creates — a `pageLoad` timer, a
 * viewport `IntersectionObserver`, a running animation, a temporary
 * variant override — must be released on exit. Ad-hoc cleanup leaks
 * whatever the author of a new trigger forgets to unregister, and
 * that leak is invisible until a long editing session degrades.
 * Funnelling acquisition through one `register` makes disposal
 * exhaustive by construction: the session cannot hand out a resource
 * it does not also hold a disposer for.
 *
 * Disposal is **idempotent and fault-isolated**: a disposer that
 * throws cannot prevent the rest from running, because a half-disposed
 * preview is exactly the state that leaks observers.
 */

/** Releases one resource acquired during a preview session. */
export type PreviewDisposer = () => void;

/** The editor's two modes (§16). */
export type EditorRunMode = "design" | "preview";

/** Temporary variant state applied while previewing. */
export interface PreviewVariantOverride {
	readonly nodeId: string;
	readonly selection: Readonly<Record<string, string>>;
}

/** A preview session: resource ownership plus temporary state. */
export interface PreviewSession {
	readonly mode: EditorRunMode;
	/** Register a resource; returns a disposer that is safe to call twice. */
	readonly register: (dispose: PreviewDisposer) => PreviewDisposer;
	/** Apply a temporary variant selection (never written to the document). */
	readonly setVariantOverride: (override: PreviewVariantOverride) => void;
	/** Live temporary overrides, keyed by node id. */
	readonly variantOverrides: ReadonlyMap<
		string,
		Readonly<Record<string, string>>
	>;
	/** Release everything. Idempotent. */
	readonly dispose: () => void;
	/** True once {@link dispose} has run. */
	readonly disposed: boolean;
	/** Number of resources still held — the leak assertion's hook. */
	readonly liveResourceCount: number;
}

/**
 * Whether interactions may run right now.
 *
 * The single place this question is answered, so "design mode does not
 * run interactions" cannot drift between the trigger binder, the motion
 * driver, and the navigation handler.
 */
export function interactionsEnabled(mode: EditorRunMode): boolean {
	return mode === "preview";
}

/**
 * Create a preview session.
 *
 * A session for `"design"` is still a valid object — it simply reports
 * `interactionsEnabled` false and holds nothing — so callers never
 * branch on null.
 */
export function createPreviewSession(mode: EditorRunMode): PreviewSession {
	const disposers = new Set<PreviewDisposer>();
	const overrides = new Map<string, Readonly<Record<string, string>>>();
	let disposed = false;

	const session: PreviewSession = {
		mode,
		register(dispose: PreviewDisposer): PreviewDisposer {
			if (disposed) {
				// Registering after disposal would silently leak: nothing
				// will ever call this disposer. Release immediately so the
				// caller's resource does not outlive the session.
				dispose();
				return NOOP;
			}
			disposers.add(dispose);
			let released = false;
			return () => {
				if (released) return;
				released = true;
				disposers.delete(dispose);
				dispose();
			};
		},
		setVariantOverride(override: PreviewVariantOverride): void {
			if (disposed) return;
			overrides.set(override.nodeId, override.selection);
		},
		get variantOverrides(): ReadonlyMap<
			string,
			Readonly<Record<string, string>>
		> {
			return overrides;
		},
		dispose(): void {
			if (disposed) return;
			disposed = true;
			// Snapshot first, because a disposer may unregister siblings
			// and mutating the set mid-iteration would skip them — but
			// re-check membership before each call, because a disposer
			// that *already* released a sibling must not cause it to run
			// twice. Double-disposal is not harmless: releasing an
			// animation or observer twice can throw, or free something a
			// later registration has since re-acquired.
			for (const dispose of [...disposers]) {
				if (!disposers.delete(dispose)) continue;
				try {
					dispose();
				} catch {
					// A throwing disposer must not strand the rest — the
					// leak it causes is worse than the error it reports.
				}
			}
			disposers.clear();
			// Temporary variant state is dropped, restoring the document's
			// own resolution (§16: exiting preview disposes variant state).
			overrides.clear();
		},
		get disposed(): boolean {
			return disposed;
		},
		get liveResourceCount(): number {
			return disposers.size;
		},
	};
	return session;
}

const NOOP: PreviewDisposer = () => {
	// Registration after disposal already released the resource.
};
