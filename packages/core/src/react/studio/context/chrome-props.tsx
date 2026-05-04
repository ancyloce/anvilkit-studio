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

import { createContext, type ReactNode, useContext } from "react";

export interface ChromeProps {
	readonly onBack?: () => void;
	readonly onSaveDraft?: () => void | Promise<void>;
	readonly isSavingDraft?: boolean;
	readonly lastSavedAt?: Date | null;
	readonly isPublishing?: boolean;
	readonly onPublishClick?: () => void;
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
