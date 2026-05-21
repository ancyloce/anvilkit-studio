/**
 * @file React context for chrome-specific `<Studio>` props.
 *
 * `<Studio>` accepts `onBack`, `onSaveDraft`, `isSavingDraft`,
 * `lastSavedAt`, `isPublishing` so host apps can wire the header
 * without reaching into the chrome's internals. The preset mounts
 * `<StudioLayout />` from its `puck` override slot — no props
 * threading possible — so the chrome reads them through this
 * context instead.
 */

import {
	type ComponentType,
	createContext,
	type ReactNode,
	useContext,
} from "react";
import type { StudioViewport } from "@/studio/ui/viewports";

/**
 * Accepted shapes for `collaboratorsSlot`. A `ReactNode` is captured
 * once at the call site and rendered verbatim — good for host apps
 * passing a static JSX element. A `ComponentType` is instantiated by
 * the chrome on every render, so its own hooks (presence subscriptions,
 * etc.) work — that's the shape plugins use via
 * {@link StudioPluginRegistration.slots}.
 */
export type CollaboratorsSlotValue = ReactNode | ComponentType;

export interface ChromeProps {
	readonly onBack?: () => void;
	readonly onSaveDraft?: () => void | Promise<void>;
	readonly isSavingDraft?: boolean;
	readonly lastSavedAt?: Date | null;
	readonly isPublishing?: boolean;
	readonly onPublishClick?: () => void;
	readonly viewports?: readonly StudioViewport[];
	/**
	 * Optional replacement for the header's placeholder
	 * `<CollaboratorStack>`. Accepts either a `ReactNode` (rendered
	 * verbatim) or a `ComponentType` (instantiated on each render so the
	 * component's own hooks fire). See
	 * {@link StudioHeaderProps.collaboratorsSlot} and
	 * {@link CollaboratorsSlotValue}.
	 */
	readonly collaboratorsSlot?: CollaboratorsSlotValue;
	/**
	 * Host-supplied download handler invoked from the publish panel's
	 * Export submenu. Receives a format id from `runtime.exportFormats`
	 * (e.g. `"json"`, `"html"`, `"react"`); the host is responsible for
	 * normalizing Puck data to {@link PageIR} via `puckDataToIR`,
	 * calling `format.run(ir, options)`, and triggering the browser
	 * download. Optional — the Export submenu disables itself when this
	 * is omitted.
	 */
	readonly onExport?: (formatId: string) => void | Promise<void>;
}

const ChromePropsContext = createContext<ChromeProps>({});

export interface ChromePropsProviderProps {
	readonly value: ChromeProps;
	readonly children: ReactNode;
}

export function ChromePropsProvider({
	value,
	children,
}: ChromePropsProviderProps): ReactNode {
	return (
		<ChromePropsContext.Provider value={value}>
			{children}
		</ChromePropsContext.Provider>
	);
}

export function useChromeProps(): ChromeProps {
	return useContext(ChromePropsContext);
}
