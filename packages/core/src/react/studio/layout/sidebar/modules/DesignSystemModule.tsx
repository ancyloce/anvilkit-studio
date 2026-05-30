/**
 * @file `design-system` module body — Design System.
 *
 * Reads the host-registered {@link StudioDesignSystemPanel} from the
 * per-instance sidebar registry and renders its `render()` thunk inside
 * the panel body. When no panel is registered the module shows the
 * `studio.module.designSystem.empty` empty state, mirroring how the
 * `copilot` / `history` modules handle a missing panel.
 *
 * Review finding **AR-a**: `registerDesignSystemPanel()` was a fully
 * wired registry seam with no rail tab or module body to render it —
 * this module (plus the `EditorTab` / `RAIL_MODULES` entries) completes
 * the seam so a registered panel is actually reachable.
 *
 * `@anvilkit/core` stays agnostic about any specific token vocabulary:
 * hosts (or an integration package paired with
 * `@anvilkit/plugin-design-system`) own the React state, token tree, and
 * theme-toggle wiring behind the registered render thunk.
 */

import { Palette as PaletteIcon } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/layout/sidebar/shared/EmptyState";
import { useMsg } from "@/state/editor-i18n-store";
import { useSidebarRegistry } from "@/state/sidebar-registry-store-react";

export function DesignSystemModule(): ReactNode {
	const msg = useMsg();
	const panel = useSidebarRegistry((state) => state.designSystemPanel);

	if (panel === null) {
		return (
			<div
				data-testid="ak-module-design-system"
				className="flex h-full flex-col"
			>
				<EmptyState
					testId="ak-design-system-empty"
					message={msg("studio.module.designSystem.empty")}
					icon={<PaletteIcon aria-hidden="true" />}
				/>
			</div>
		);
	}

	return (
		<div
			data-testid="ak-module-design-system"
			className="flex h-full flex-col p-2"
		>
			{panel.render()}
		</div>
	);
}
