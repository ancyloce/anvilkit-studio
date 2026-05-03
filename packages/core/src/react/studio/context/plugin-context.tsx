/**
 * @file React context for the live `StudioPluginContext`.
 *
 * The chrome's header actions, layout shell, and (later) field
 * components need access to `ctx` so they can call `ctx.log`,
 * `ctx.getPuckApi()`, and the per-action `onClick(ctx)` /
 * `disabled(ctx)` callbacks.
 *
 * Instead of threading `ctx` through every component as a prop, the
 * `<Studio>` component publishes it through this context once, and
 * descendants read it via {@link useStudioPluginContext}.
 *
 * The context is **internal** — only re-exported under
 * `react/studio/context` for chrome modules. Public `useStudio()`
 * already exposes the plugin metadata projection; consumers don't
 * need raw `ctx`.
 */

import { createContext, type ReactNode, useContext } from "react";

import type { StudioPluginContext } from "../../../types/plugin.js";

const StudioPluginContextContext =
	createContext<StudioPluginContext | null>(null);

export interface StudioPluginContextProviderProps {
	readonly value: StudioPluginContext;
	readonly children: ReactNode;
}

export function StudioPluginContextProvider({
	value,
	children,
}: StudioPluginContextProviderProps): ReactNode {
	return (
		<StudioPluginContextContext.Provider value={value}>
			{children}
		</StudioPluginContextContext.Provider>
	);
}

export function useStudioPluginContext(): StudioPluginContext {
	const ctx = useContext(StudioPluginContextContext);
	if (ctx === null) {
		throw new Error(
			"useStudioPluginContext was called outside of <StudioPluginContextProvider>. " +
				"Ensure the calling component is rendered inside <Studio>.",
		);
	}
	return ctx;
}

/**
 * Non-throwing variant — returns `null` outside a provider so unit
 * tests for individual components can render without mounting the
 * full provider stack.
 */
export function useStudioPluginContextOrNull(): StudioPluginContext | null {
	return useContext(StudioPluginContextContext);
}
