/**
 * @file Per-`<Studio>` root-element context, used to scope DOM
 * queries (the Puck preview iframe) to a single editor instance.
 *
 * Puck hardcodes `id="preview-frame"` on its iframe with no override
 * prop, so two `<Studio>` instances on one page produce duplicate
 * ids. A global `document.querySelector("iframe#preview-frame")`
 * therefore always resolves to the first editor's iframe. Scoping the
 * query to each Studio's own root subtree disambiguates them. (Puck's
 * own internal global query remains an upstream limitation outside
 * our control.)
 *
 * `useStudioRootRef()` is tolerant: it returns `null` outside a
 * provider so callers fall back to `document` (single-editor pages,
 * tests), preserving existing behavior.
 */

import { createContext, type ReactNode, type RefObject, use } from "react";

type StudioRootRef = RefObject<HTMLElement | null>;

const StudioRootContext = createContext<StudioRootRef | null>(null);

export interface StudioRootProviderProps {
	readonly rootRef: StudioRootRef;
	readonly children: ReactNode;
}

export function StudioRootProvider({
	rootRef,
	children,
}: StudioRootProviderProps): ReactNode {
	return <StudioRootContext value={rootRef}>{children}</StudioRootContext>;
}

/**
 * The current Studio root ref, or `null` when rendered outside a
 * `StudioRootProvider`. Callers should treat `null` (or a `null`
 * `.current`) as "fall back to `document`".
 */
export function useStudioRootRef(): StudioRootRef | null {
	return use(StudioRootContext);
}

/**
 * Resolve the element to scope a DOM query within: the Studio root
 * element when available, otherwise `document` (caller-safe default
 * that preserves single-editor / test behavior).
 */
export function resolveQueryRoot(ref: StudioRootRef | null): ParentNode {
	return ref?.current ?? document;
}
