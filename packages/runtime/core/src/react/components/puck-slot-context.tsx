"use client";

import type { Overrides as PuckOverrides } from "@puckeditor/core";
import {
	createContext,
	Fragment,
	type ReactElement,
	type ReactNode,
	useContext,
} from "react";

/** Puck's root chrome slot — a component type, not a render callback. */
export type PuckSlotRender = NonNullable<Partial<PuckOverrides>["puck"]>;

const PuckSlotContext = createContext<PuckSlotRender | null>(null);

/**
 * The one component identity handed to Puck for the lifetime of a Studio
 * mount. The current composition arrives through React context, so a render
 * never has to write a ref merely to make this pass observe fresh overrides.
 */
export function StablePuckSlot({
	children,
}: {
	readonly children: ReactNode;
}): ReactElement {
	const render = useContext(PuckSlotContext);
	return render === null ? <>{children}</> : render({ children });
}

export function PuckSlotProvider({
	children,
	value,
}: {
	readonly children: ReactNode;
	readonly value: PuckSlotRender | null;
}): ReactElement {
	return (
		<PuckSlotContext.Provider value={value}>
			{children}
		</PuckSlotContext.Provider>
	);
}
