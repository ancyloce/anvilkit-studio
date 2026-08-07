"use client";

/**
 * @file `useDocumentModel` / `useNodeField` — the React half of report
 * 0021's fix (PLAN-0026 §3.2, `p2-005`).
 *
 * Report 0021 §6 named the structural defect precisely: editor
 * **writes** landed in the declared carriers while editor **reads**
 * projected from a sidecar that carrier documents never populated, so
 * the inspector could show nothing for state that was genuinely
 * stored. This binding is what makes reads and writes share one
 * source — `appState.data`, the same object the commit helpers'
 * functional `setData` updates and the same `Data` the compiler and
 * `<Render>` consume.
 *
 * The shape is deliberately identical to the proven
 * `composition/use-compiled-appearance.ts`: read `appState.data` and
 * `config` through `createUsePuck` selectors, defer the document with
 * `useDeferredValue`, and run a pure projection over the result. At
 * 500+ nodes, where a dispatch plus a full projection exceeds a frame,
 * typing and dragging stay responsive while the model lags at most one
 * deferred render behind. That is the same degradation the compiler
 * already has — not a new one.
 *
 * **Holds no state.** It derives. There is no store, no context
 * carrying a copy, and no command port. `readDocument` is pure, so
 * remounting or re-rendering can never produce a different answer for
 * the same `(data, config)`.
 *
 * **Must render inside `<Puck>`.** `useReactivePuck` is a
 * `createUsePuck` selector and throws outside the provider — the same
 * constraint `StylePanel`'s header already states for the composition
 * surfaces.
 */

import { useDeferredValue, useMemo } from "react";
import {
	type DocumentModel,
	type NodeFieldAddress,
	type NodeFieldRead,
	readDocument,
	readNodeField,
} from "../../document-model/index.js";
import { useReactivePuck } from "../overrides/utils/use-reactive-puck.js";

/**
 * The live document, projected.
 *
 * Re-renders once per deferred change. Consumers get the reference
 * stability `readDocument` guarantees: a node whose carrier content is
 * structurally unchanged comes back as the **identical**
 * `DocumentNode`, so a component subscribing to one node does not
 * re-render because an unrelated node moved.
 *
 * That guarantee is structural, not incidental, and it is not props
 * identity: `walkTree` rebuilds every object it visits (measured in
 * `p2-001` against `@puckeditor/core@0.22.4`), so a cache keyed on a
 * walked props object would never hit. `readDocument` keys by node id
 * and validates with `deepEqualJson` over the raw carriers instead —
 * which also survives Puck reallocating a node it did not change.
 */
export function useDocumentModel(): DocumentModel {
	const data = useReactivePuck((state) => state.appState.data);
	const config = useReactivePuck((state) => state.config);
	const deferredData = useDeferredValue(data);
	return useMemo(
		() => readDocument(deferredData, config),
		[deferredData, config],
	);
}

/**
 * One field of one style target, read across the selection.
 *
 * Target-addressed by construction — the address is `p2-003`'s
 * `NodeFieldAddress`, derived from the write path's
 * `UpdateAppearanceInput`, so a consumer *cannot* express a node-only
 * address even by accident. Omit `targetId` for the node's root
 * target; page mode and component mode are the same call.
 *
 * Deliberately not memoized on the address. An address is a fresh
 * object every render, so a `useMemo` over it would either never hit
 * or need a hand-rolled key — and a hand-rolled key that misses a
 * field returns a stale read, which is the bug class this whole
 * program exists to remove. `readNodeField` is instead cheap by
 * construction: it is pure, its cost is bounded by *selection* size
 * rather than document size, and the capability resolution underneath
 * it is memoized per `(config, type)` in `puck/component-metadata.ts`.
 * The expensive part — projecting the document — is memoized once, in
 * {@link useDocumentModel}, and shared by every field control.
 */
export function useNodeField<T = unknown>(
	address: NodeFieldAddress,
): NodeFieldRead<T> {
	const model = useDocumentModel();
	return readNodeField<T>(model, address);
}
