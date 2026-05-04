/**
 * @file React selector hook for the per-instance sidebar registry.
 *
 * `useSidebarRegistry(selector)` mirrors `useEditorUiStore(selector)`:
 * subscribes the calling component to the registry store via Zustand's
 * `useStore`, so plugin-contributed surfaces re-render their consumers
 * when registrations change.
 */

import { useStore } from "zustand";
import { useSidebarRegistryStoreApi } from "./SidebarRegistryProvider";
import type { SidebarRegistryState } from "./sidebar-registry-store";

/**
 * Generic selector hook for the sidebar registry. Throws when called
 * outside a `<SidebarRegistryProvider>` (which `<Studio>` always
 * renders).
 */
export function useSidebarRegistry<TResult>(
	selector: (state: SidebarRegistryState) => TResult,
): TResult {
	const store = useSidebarRegistryStoreApi();
	return useStore(store, selector);
}
