/**
 * @file React context for the `<Studio>` `pages` prop.
 *
 * The `layer` sidebar module reads the host's page list through this
 * context. `<Studio>` accepts a `pages?: StudioPagesSource` prop and
 * mounts the provider inside the AnvilKit chrome's provider stack.
 * Modules consume the source via {@link useStudioPagesSource}, which
 * returns `undefined` when the host did not pass `pages` — the module
 * falls back to its empty state in that case.
 */

import { createContext, type ReactNode, useContext } from "react";

import type { StudioPagesSource } from "@/types/pages";

const StudioPagesSourceContext = createContext<StudioPagesSource | undefined>(
	undefined,
);

export interface StudioPagesSourceProviderProps {
	readonly value: StudioPagesSource | undefined;
	readonly children: ReactNode;
}

export function StudioPagesSourceProvider({
	value,
	children,
}: StudioPagesSourceProviderProps): ReactNode {
	return (
		<StudioPagesSourceContext.Provider value={value}>
			{children}
		</StudioPagesSourceContext.Provider>
	);
}

/**
 * Read the active pages source. Returns `undefined` outside a provider
 * or when the host did not pass a `pages` prop to `<Studio>`. Consumers
 * should treat that as the "no pages source" empty state (PRD §6.4).
 */
export function useStudioPagesSource(): StudioPagesSource | undefined {
	return useContext(StudioPagesSourceContext);
}
