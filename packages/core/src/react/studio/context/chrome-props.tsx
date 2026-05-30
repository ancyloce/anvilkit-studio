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

import { createContext, type ReactNode, use } from "react";
import type { StudioViewport } from "@/studio/ui/viewports";

export interface ChromeProps {
	readonly onBack?: () => void;
	readonly onSaveDraft?: () => void | Promise<void>;
	readonly isSavingDraft?: boolean;
	readonly lastSavedAt?: Date | null;
	readonly isPublishing?: boolean;
	readonly onPublishClick?: () => void;
	readonly viewports?: readonly StudioViewport[];
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
	return <ChromePropsContext value={value}>{children}</ChromePropsContext>;
}

export function useChromeProps(): ChromeProps {
	return use(ChromePropsContext);
}
