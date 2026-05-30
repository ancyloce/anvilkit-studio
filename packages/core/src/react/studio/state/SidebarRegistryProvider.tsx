/**
 * @file React context provider for the per-instance sidebar registry.
 *
 * The provider accepts the store as a `value` prop (rather than
 * lazy-creating one) because `<Studio>` needs the same store
 * reference to thread through the plugin context — plugins must
 * register surfaces *before* the React tree mounts the sidebar that
 * consumes them.
 */

import { createContext, type ReactNode, use } from "react";

import type { SidebarRegistryStoreApi } from "./sidebar-registry-store";

const SidebarRegistryContext = createContext<SidebarRegistryStoreApi | null>(
	null,
);

export interface SidebarRegistryProviderProps {
	readonly value: SidebarRegistryStoreApi;
	readonly children: ReactNode;
}

export function SidebarRegistryProvider({
	value,
	children,
}: SidebarRegistryProviderProps): ReactNode {
	return (
		<SidebarRegistryContext value={value}>{children}</SidebarRegistryContext>
	);
}

/**
 * Internal accessor for the active registry store. Throws if used
 * outside a `SidebarRegistryProvider` so missing wiring fails loudly
 * during development.
 */
export function useSidebarRegistryStoreApi(): SidebarRegistryStoreApi {
	const store = use(SidebarRegistryContext);
	if (store === null) {
		throw new Error(
			"useSidebarRegistryStoreApi was called outside of <SidebarRegistryProvider>. " +
				"Ensure the calling component is rendered inside <Studio>.",
		);
	}
	return store;
}

/**
 * Non-throwing variant — returns `null` outside a provider so unit
 * tests for components that only conditionally read the registry can
 * mount without the full provider stack.
 */
export function useSidebarRegistryStoreApiOrNull(): SidebarRegistryStoreApi | null {
	return use(SidebarRegistryContext);
}
