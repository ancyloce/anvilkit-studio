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
 * A **second** index (PLAN-0026 §3.7.2, finding A-6) addresses declared
 * **style targets**: the `data-ak-style-node` / `data-ak-style-target`
 * pair every component stamps through its `anvilRootAttrs` /
 * `anvilTargetAttrs` helper. It is keyed as a nested
 * `Map<nodeId, Map<targetId, elements>>` rather than a joined string:
 * neither id is escaped anywhere, so `"a:b" + ":" + "c"` and
 * `"a" + ":" + "b:c"` would collide. The pair indexed here is exactly
 * the pair the style compiler's selector targets
 * (`style-compiler/compile.ts:364`), so what the canvas can hit is
 * exactly what the CSS can style — hit-testing and styling cannot
 * diverge.
 *
 * **Both indices are built in ONE selector pass under ONE mutation
 * observer** — the widening is additive, not a second traversal. An
 * element can feed either or both: a component root stamps
 * `data-ak-node` *and* the `root` target pair, while an inner target
 * element stamps only the pair.
 *
 * This deliberately duplicates a slice of Puck's internal `NodesSlice`
 * (not publicly reachable — verified constraint).
 */

/** The `(nodeId, targetId)` pair addressing one declared style target. */
export interface CanvasStyleTargetRef {
	readonly nodeId: string;
	readonly targetId: string;
}

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
	/**
	 * Every element stamped with the `(nodeId, targetId)` pair, in
	 * document order — **plural by design, not by defensiveness.**
	 *
	 * A repeated target stamps the *same* target id on *every* instance
	 * it renders: `blog-list` spreads `targetAttrs.card` across both of
	 * its card branches (`blog-list/src/BlogList.tsx:148,160`), once per
	 * post, so a five-post list has five `card` elements under one
	 * `(nodeId, "card")` key. A singular accessor would therefore be
	 * wrong at the *type* level rather than merely incomplete —
	 * highlighting, hit-testing and the §3.7 multi-instance count all
	 * need the whole set, and picking "the" element would silently pick
	 * the first post's card.
	 *
	 * Empty array when the node, the target, or the whole document is
	 * absent — never `null`, so callers never branch on emptiness.
	 */
	getTargetElements(nodeId: string, targetId: string): readonly HTMLElement[];
	/**
	 * Resolve an element (e.g. a pointer-event target) to the declared
	 * style target that owns it: the nearest ancestor-or-self carrying
	 * `data-ak-style-target` whose `data-ak-style-node` names a node
	 * this registry has indexed.
	 *
	 * Returns `null` for an element outside any component, and `null`
	 * for a stamped target whose node id is not indexed (an unmounted
	 * or foreign subtree) — an unindexed id is not addressable, so
	 * handing it back would invite a write against a node that is not
	 * in the document.
	 *
	 * Callers holding an `EventTarget` must narrow with
	 * {@link isElementNode} first: the canvas is a separate JS realm.
	 */
	resolveTarget(element: Element): CanvasStyleTargetRef | null;
	/** Every currently mounted node id (document order). */
	listNodeIds(): readonly string[];
	/** Subscribe to structural changes. Returns an unsubscribe fn. */
	observe(listener: () => void): () => void;
}

const AK_ATTRIBUTE = "data-ak-node";
const PUCK_ATTRIBUTE = "data-puck-component";
const PRIMARY_ATTRIBUTE = "data-ak-primary";
const STYLE_NODE_ATTRIBUTE = "data-ak-style-node";
const TARGET_ATTRIBUTE = "data-ak-style-target";

/**
 * Node-index selector — deliberately NOT widened. `getNodeId` resolves
 * through `closest`, so adding `[data-ak-style-target]` here would let
 * an inner target element (which carries no node attribute) win the
 * `closest` match and turn a resolvable node id into `null`. The node
 * half of this registry has to behave exactly as it did.
 */
const NODE_SELECTOR = `[${AK_ATTRIBUTE}], [${PUCK_ATTRIBUTE}]`;
/** Style-target selector, used for both indexing and `resolveTarget`. */
const TARGET_SELECTOR = `[${TARGET_ATTRIBUTE}]`;
/** The single pass that feeds BOTH indices. */
const SELECTOR = `${NODE_SELECTOR}, ${TARGET_SELECTOR}`;

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

/** Optional wiring for {@link createCanvasDomRegistry}. */
export interface CanvasDomRegistryOptions {
	/**
	 * Dev-only observer instrumentation (CORE-P4-002): called with the
	 * number of MutationRecords in each callback, so the §28 overlay can
	 * report observer batch size. Absent in production — the registry
	 * pays one `undefined` check per callback.
	 */
	readonly onObserverBatch?: (recordCount: number) => void;
}

/** Create a per-`<Studio>` canvas DOM registry. */
export function createCanvasDomRegistry(
	options?: CanvasDomRegistryOptions,
): CanvasDomRegistry {
	let doc: Document | null = null;
	let observer: MutationObserver | null = null;
	let dirty = true;
	let index = new Map<string, HTMLElement[]>();
	/** `nodeId → targetId → elements`. Nested, never a joined key. */
	let targetIndex = new Map<string, Map<string, HTMLElement[]>>();
	const listeners = new Set<() => void>();

	const notify = (): void => {
		for (const listener of listeners) {
			listener();
		}
	};

	const rebuild = (): void => {
		dirty = false;
		index = new Map();
		targetIndex = new Map();
		if (doc === null) {
			return;
		}
		// ONE traversal, TWO indices. The node half below is unchanged
		// apart from `continue` becoming a guarded block, so an element
		// that feeds no node id can still feed the target index.
		for (const element of doc.querySelectorAll<HTMLElement>(SELECTOR)) {
			const nodeId = idOf(element);
			if (nodeId !== null && nodeId.length > 0) {
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
			const targetId = element.getAttribute(TARGET_ATTRIBUTE);
			if (targetId === null || targetId.length === 0) {
				continue;
			}
			const styleNodeId = element.getAttribute(STYLE_NODE_ATTRIBUTE);
			if (styleNodeId === null || styleNodeId.length === 0) {
				continue;
			}
			let byTarget = targetIndex.get(styleNodeId);
			if (byTarget === undefined) {
				byTarget = new Map();
				targetIndex.set(styleNodeId, byTarget);
			}
			const targets = byTarget.get(targetId);
			if (targets === undefined) {
				byTarget.set(targetId, [element]);
			} else {
				// Repeated targets append: every instance of a repeated
				// element stamps the same id (blog-list's `card`).
				targets.push(element);
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
				observer = new Mo((records) => {
					options?.onObserverBatch?.(records.length);
					dirty = true;
					notify();
				});
				observer.observe(nextDoc.body ?? nextDoc.documentElement, {
					subtree: true,
					childList: true,
					attributes: true,
					attributeFilter: [
						AK_ATTRIBUTE,
						PUCK_ATTRIBUTE,
						PRIMARY_ATTRIBUTE,
						STYLE_NODE_ATTRIBUTE,
						TARGET_ATTRIBUTE,
					],
				});
			}
			notify();
		},

		dispose() {
			observer?.disconnect();
			observer = null;
			doc = null;
			index = new Map();
			targetIndex = new Map();
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
			const host = element.closest(NODE_SELECTOR);
			return host === null ? null : idOf(host);
		},

		getTargetElements(nodeId, targetId) {
			ensure();
			return targetIndex.get(nodeId)?.get(targetId) ?? [];
		},

		resolveTarget(element) {
			ensure();
			// `closest` is ancestor-or-self and does the walk natively —
			// no hand-rolled parent loop. The loop below re-enters only
			// when a stamped target names a node the registry does not
			// know (an unmounted or foreign subtree), so the common path
			// is a single `closest` call plus two attribute reads.
			let candidate: Element | null = element.closest(TARGET_SELECTOR);
			while (candidate !== null) {
				const targetId = candidate.getAttribute(TARGET_ATTRIBUTE);
				const nodeId = candidate.getAttribute(STYLE_NODE_ATTRIBUTE);
				if (
					nodeId !== null &&
					nodeId.length > 0 &&
					targetId !== null &&
					targetId.length > 0 &&
					index.has(nodeId)
				) {
					return { nodeId, targetId };
				}
				const parent = candidate.parentElement;
				candidate = parent === null ? null : parent.closest(TARGET_SELECTOR);
			}
			return null;
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
