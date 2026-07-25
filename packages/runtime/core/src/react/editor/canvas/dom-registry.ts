"use client";

/**
 * @file `CanvasDomRegistry` (PLAN-0020 CORE-P1B-001; ED-CANVAS-001
 * foundation; DD-0019 §13.2).
 *
 * The id↔element index every canvas surface builds on. Two sources,
 * strictly ordered:
 *
 * - **`data-ak-node`** (stamped by CORE-P0-011 decoration through the
 *   authoring-style lookup) is authoritative — components that
 *   declared `metadata.editor` always resolve through it;
 * - **`[data-puck-component]`** (Puck's own selection attribute, value
 *   = node id) is the legacy fallback so undeclared components stay
 *   selectable; the registry never manipulates styles through it.
 *
 * Fragments/multi-root renders may stamp several elements per id; the
 * **primary** element is an explicit `data-ak-primary` target when one
 * exists, else the first match in document order. The index rebuilds
 * lazily on DOM mutations (attribute + childList observer, mark-dirty)
 * and cleanly on iframe **document replacement** via `register(doc)`.
 * A node whose element never appears (missing target) simply resolves
 * to `null` — selection then remains Layers-only, no timeout spin.
 *
 * This deliberately duplicates a slice of Puck's internal `NodesSlice`
 * (not publicly reachable — verified constraint).
 */

/** The §13.2 registry surface. */
export interface CanvasDomRegistry {
	/** Bind (or re-bind, on document replacement) to an iframe doc. */
	register(doc: Document): void;
	/** Detach observers and clear the index. */
	dispose(): void;
	/** The primary element for a node id, or `null` when unmounted. */
	getPrimaryElement(nodeId: string): HTMLElement | null;
	/** Every element stamped for a node id (fragments/multi-root). */
	getElements(nodeId: string): readonly HTMLElement[];
	/** Resolve an element (e.g. an event target) to its node id. */
	getNodeId(element: Element): string | null;
	/** Every currently mounted node id (document order). */
	listNodeIds(): readonly string[];
	/** Subscribe to structural changes. Returns an unsubscribe fn. */
	observe(listener: () => void): () => void;
}

const AK_ATTRIBUTE = "data-ak-node";
const PUCK_ATTRIBUTE = "data-puck-component";
const PRIMARY_ATTRIBUTE = "data-ak-primary";
const SELECTOR = `[${AK_ATTRIBUTE}], [${PUCK_ATTRIBUTE}]`;

/**
 * Realm-safe element check. The canvas iframe is a separate JS realm
 * (srcdoc window), so `instanceof Element` against the parent
 * window's constructor is ALWAYS false for canvas nodes — every
 * event-target check in editor canvas code must use this instead.
 */
export function isElementNode(value: unknown): value is Element {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as Node).nodeType === 1
	);
}

function idOf(element: Element): string | null {
	return (
		element.getAttribute(AK_ATTRIBUTE) ?? element.getAttribute(PUCK_ATTRIBUTE)
	);
}

/** Create a per-`<Studio>` canvas DOM registry. */
export function createCanvasDomRegistry(): CanvasDomRegistry {
	let doc: Document | null = null;
	let observer: MutationObserver | null = null;
	let dirty = true;
	let index = new Map<string, HTMLElement[]>();
	const listeners = new Set<() => void>();

	const notify = (): void => {
		for (const listener of listeners) {
			listener();
		}
	};

	const rebuild = (): void => {
		dirty = false;
		index = new Map();
		if (doc === null) {
			return;
		}
		for (const element of doc.querySelectorAll<HTMLElement>(SELECTOR)) {
			const nodeId = idOf(element);
			if (nodeId === null || nodeId.length === 0) {
				continue;
			}
			const bucket = index.get(nodeId);
			if (bucket === undefined) {
				index.set(nodeId, [element]);
			} else if (
				// Authoritative source wins the bucket: once an ak-stamped
				// element exists, puck-only duplicates for the same id are
				// secondary matches after it.
				element.hasAttribute(AK_ATTRIBUTE) &&
				!(bucket[0]?.hasAttribute(AK_ATTRIBUTE) ?? false)
			) {
				bucket.unshift(element);
			} else {
				bucket.push(element);
			}
		}
	};

	const ensure = (): void => {
		if (dirty) {
			rebuild();
		}
	};

	return {
		register(nextDoc) {
			// Document replacement: drop the old observer + index wholesale.
			observer?.disconnect();
			doc = nextDoc;
			dirty = true;
			const Mo =
				nextDoc.defaultView?.MutationObserver ??
				(typeof MutationObserver !== "undefined"
					? MutationObserver
					: undefined);
			if (Mo !== undefined) {
				observer = new Mo(() => {
					dirty = true;
					notify();
				});
				observer.observe(nextDoc.body ?? nextDoc.documentElement, {
					subtree: true,
					childList: true,
					attributes: true,
					attributeFilter: [AK_ATTRIBUTE, PUCK_ATTRIBUTE, PRIMARY_ATTRIBUTE],
				});
			}
			notify();
		},

		dispose() {
			observer?.disconnect();
			observer = null;
			doc = null;
			index = new Map();
			dirty = true;
			listeners.clear();
		},

		getPrimaryElement(nodeId) {
			ensure();
			const elements = index.get(nodeId);
			if (elements === undefined || elements.length === 0) {
				return null;
			}
			// Explicit primary target for fragments/multi-root (§13.2).
			return (
				elements.find((element) => element.hasAttribute(PRIMARY_ATTRIBUTE)) ??
				elements[0] ??
				null
			);
		},

		getElements(nodeId) {
			ensure();
			return index.get(nodeId) ?? [];
		},

		getNodeId(element) {
			const host = element.closest(SELECTOR);
			return host === null ? null : idOf(host);
		},

		listNodeIds() {
			ensure();
			return [...index.keys()];
		},

		observe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
