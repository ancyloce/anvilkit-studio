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

import type { Data } from "@puckeditor/core";
import { createContext, type ReactNode, use } from "react";
import type { StudioViewport } from "@/studio/ui/viewports";

export interface ChromeProps {
	/**
	 * Invoked by the header's back affordance. When omitted, the affordance
	 * still renders and falls back to `window.history.back()`.
	 */
	readonly onBack?: () => void;
	/**
	 * Invoked by the header's Save-draft control. May be async; report progress
	 * back to the control via the separately-supplied
	 * {@link ChromeProps.isSavingDraft} — it is not inferred from the returned
	 * promise.
	 */
	readonly onSaveDraft?: () => void | Promise<void>;
	/** When `true`, the Save-draft control is disabled and shows its busy label. */
	readonly isSavingDraft?: boolean;
	/**
	 * When the draft was last saved — surfaced as a "last saved" hint in the
	 * header. `null` or omitted hides the hint.
	 */
	readonly lastSavedAt?: Date | null;
	/** When `true`, the Publish control is disabled and shows its busy label. */
	readonly isPublishing?: boolean;
	/** Receives the live editor document (read from the Puck API at click time). */
	readonly onPublishClick?: (data: Data) => void;
	/**
	 * Invoked by the header's Preview control (the ▶ button). Receives the live
	 * editor document (read from the Puck API at click time) so the host can open
	 * a preview of the current edits (e.g. a render route in a new tab). When
	 * omitted, the Preview button renders disabled.
	 */
	readonly onPreview?: (data: Data) => void;
	/** Responsive viewport presets for the toolbar's viewport selector. */
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
	/**
	 * Host-supplied node rendered in the chrome header's right-hand action
	 * cluster (between the plugin header actions and the Preview / Publish
	 * controls). The seam for arbitrary host header content — e.g. the
	 * `LanguageSwitcher`. Memoize it host-side to keep this context value
	 * stable. Ignored when `chrome="puck"`.
	 */
	readonly headerEnd?: ReactNode;
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
