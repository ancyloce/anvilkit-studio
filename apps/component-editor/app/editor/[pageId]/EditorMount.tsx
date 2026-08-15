"use client";

import { Studio } from "@anvilkit/core";
import type { Config, Data } from "@puckeditor/core";
import { useMemo } from "react";
import { createComponentEditorConfig } from "@/lib/editor-config";
import { componentEditorPlugins } from "@/lib/plugins";

export interface EditorMountProps {
	pageId: string;
	initialData: Data;
	locale?: string;
}

/**
 * The single `<Studio>` mount (design 0022 §1.2), mirroring the studio
 * app's shape (`apps/studio/app/puck/editor/page.tsx:1137-1186`).
 *
 * Two mount-level invariants carried over from core's conventions:
 *
 * - **`key` remount on page switch.** `data` is an initial seed only —
 *   Puck owns its draft after mount, so a prop change alone would not
 *   re-target the editor.
 * - **Stable `storeId`.** The persisted editor UI slice (rail tab,
 *   viewport) stays keyed consistently, so it rehydrates across that
 *   remount instead of resetting.
 *
 * `editor.features.enabled` is what makes `ctx.editor` present for
 * plugins (`packages/runtime/core/src/types/plugin-context.ts:369-375`) —
 * the code-editor plugin's whole surface depends on it (P0-13).
 */
export function EditorMount({ pageId, initialData, locale }: EditorMountProps) {
	const puckConfig = useMemo(
		() => createComponentEditorConfig(locale) as unknown as Config,
		[locale],
	);

	return (
		<Studio
			key={`${pageId}::editor`}
			storeId="component-editor"
			puckConfig={puckConfig}
			data={initialData}
			plugins={componentEditorPlugins}
			editor={{ features: { enabled: true } }}
			config={locale === undefined ? undefined : { i18n: { locale } }}
		/>
	);
}
