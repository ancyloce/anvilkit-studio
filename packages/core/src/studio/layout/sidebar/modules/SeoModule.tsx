/**
 * @file `seo` module body — Page SEO (PRD 0004 F5).
 *
 * Reads the host-registered {@link StudioSeoPanel} from the per-instance
 * sidebar registry and renders its `render()` thunk inside the panel body.
 * When no panel is registered the module shows the `studio.module.seo.empty`
 * empty state, mirroring how the `history`/`design-system` modules handle a
 * missing panel. `@anvilkit/core` stays agnostic about the panel's internals —
 * `@anvilkit/plugin-page-seo` owns the form and the `root.props.seo` dispatch.
 */

import { Search as SeoIcon } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/layout/sidebar/shared/EmptyState";
import { useMsg } from "@/state/editor-i18n-context";
import { useSidebarRegistry } from "@/state/sidebar-registry/use-sidebar-registry";

export function SeoModule(): ReactNode {
	const msg = useMsg();
	const panel = useSidebarRegistry((state) => state.seoPanel);

	if (panel === null) {
		return (
			<div data-testid="ak-module-seo" className="flex h-full flex-col">
				<EmptyState
					testId="ak-seo-empty"
					message={msg("studio.module.seo.empty")}
					icon={<SeoIcon aria-hidden="true" />}
				/>
			</div>
		);
	}

	return (
		<div data-testid="ak-module-seo" className="flex h-full flex-col p-2">
			{panel.render()}
		</div>
	);
}
