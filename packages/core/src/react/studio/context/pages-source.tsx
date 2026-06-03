/**
 * @file React context for the `<Studio>` `pages` prop.
 *
 * The `layer` sidebar module reads the host's page list through this
 * context. `<Studio>` accepts a `pages?: StudioPagesSource` prop and
 * mounts the provider inside the AnvilKit chrome's provider stack.
 *
 * Two consumer hooks:
 *
 *   - {@link useStudioPagesSource} returns the raw host source, or
 *     `undefined` when the host passed no `pages` prop. Host-driven
 *     affordances (toolbar Home navigation, the add-page dialog) read
 *     this directly so they stay inert without a real source.
 *   - {@link useStudioPagesSourceOrDefault} returns the host source, or
 *     a synthetic single-page fallback when none was passed. The page
 *     list / layer outline modules read this so the studio always shows
 *     a default "Home" page instead of an empty state.
 */

import { createContext, type ReactNode, use, useMemo } from "react";

import { useSourceList } from "@/layout/sidebar/modules/layer/use-source-list";
import { useMsg } from "@/state/editor-i18n-context";
import type { StudioPage, StudioPagesSource } from "@/types/pages";

const StudioPagesSourceContext = createContext<StudioPagesSource | undefined>(
	undefined,
);

/**
 * Id of the synthetic page used by {@link useStudioPagesSourceOrDefault}
 * when the host passes no `pages` prop. Stable so the row's testid
 * (`ak-layer-page-row-default`) and active-state are predictable.
 */
export const DEFAULT_PAGES_PAGE_ID = "default";

export interface StudioPagesSourceProviderProps {
	readonly value: StudioPagesSource | undefined;
	readonly children: ReactNode;
}

export function StudioPagesSourceProvider({
	value,
	children,
}: StudioPagesSourceProviderProps): ReactNode {
	return (
		<StudioPagesSourceContext value={value}>
			{children}
		</StudioPagesSourceContext>
	);
}

/**
 * Read the raw host pages source. Returns `undefined` outside a provider
 * or when the host did not pass a `pages` prop to `<Studio>`. Use this
 * for affordances that must stay inert without a real host source (e.g.
 * the toolbar Home button, the add-page dialog). Page-display modules
 * should prefer {@link useStudioPagesSourceOrDefault}.
 */
export function useStudioPagesSource(): StudioPagesSource | undefined {
	return use(StudioPagesSourceContext);
}

/**
 * Read the host pages source, falling back to a synthetic single-page
 * source when the host passed no `pages` prop. The fallback exposes one
 * `active`, `locked` "Home" page (title from
 * `studio.module.layer.pages.defaultTitle`) and no mutation callbacks,
 * so the page list and layer outline render their default page instead
 * of the "No pages yet." / "Select a page to see its layers." empty
 * states. A real source that returns an empty list still falls through
 * to those empty states — the default only stands in for "no source".
 */
export function useStudioPagesSourceOrDefault(): StudioPagesSource {
	const source = use(StudioPagesSourceContext);
	const msg = useMsg();
	return useMemo<StudioPagesSource>(() => {
		if (source !== undefined) return source;
		const defaultPage: StudioPage = {
			id: DEFAULT_PAGES_PAGE_ID,
			title: msg("studio.module.layer.pages.defaultTitle"),
			active: true,
			locked: true,
		};
		return { list: () => [defaultPage] };
	}, [source, msg]);
}

/**
 * Read the host's currently-active page — the first row the source marks
 * `active: true` — or `null` when there is no source, no active row, or
 * the list has not resolved yet.
 *
 * Reads the *raw* source (via {@link useStudioPagesSource}) rather than
 * the synthetic-default variant, so hosts that pass no `pages` prop yield
 * `null` and consumers keep their own fallback. Subscribes through
 * {@link useSourceList} so the value tracks live `onSelect` changes.
 *
 * Used by the header breadcrumb to show the active page's title in place
 * of the static "Untitled file" label.
 */
export function useActivePage(): StudioPage | null {
	const source = useStudioPagesSource();
	const { items } = useSourceList<StudioPage>(source);
	return items.find((page) => page.active === true) ?? null;
}
