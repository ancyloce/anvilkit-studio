/**
 * @file `<PublishPanel>` — single header entry point that consolidates
 * Save / Publish / Export.
 *
 * Click "Publish" → animate-ui Popover opens with three rows:
 *
 *   1. Save draft (calls `chromeProps.onSaveDraft`)
 *   2. Publish to live (calls `chromeProps.onPublishClick`)
 *   3. Export (animate-ui Menu submenu with one item per registered
 *      `runtime.exportFormats` entry — JSON built-in, plus any plugin
 *      formats like `plugin-export-html` / `plugin-export-react`)
 *
 * Plugin internals are never imported here. The panel reads the
 * registered `ExportFormatDefinition` set from the runtime and routes
 * the actual download through the host-supplied `chromeProps.onExport`
 * callback, mirroring how `onSaveDraft` and `onPublishClick` are
 * already plumbed.
 */

import { useGetPuck } from "@puckeditor/core";
import { ChevronDown, Download } from "lucide-react";
import { type ReactNode } from "react";
import { useChromeProps } from "@/context/chrome-props";
import { useStudioRuntime } from "@/hooks/use-studio";
import {
	Menu,
	MenuItem,
	MenuPanel,
	MenuTrigger,
} from "@/primitives/animate-ui/components/base/menu";
import {
	Popover,
	PopoverPopup,
	PopoverPortal,
	PopoverPositioner,
	PopoverTrigger,
} from "@/primitives/animate-ui/primitives/base/popover";
import { Button } from "@/primitives/button";
import { useMsg } from "@/state/editor-i18n-context";
import type { ExportFormatDefinition } from "@/types/export";
import { formatRelativeTimestamp } from "@/utils/format-timestamp";

export function PublishPanel(): ReactNode {
	const msg = useMsg();
	const {
		onSaveDraft,
		isSavingDraft = false,
		lastSavedAt = null,
		onPublishClick,
		isPublishing = false,
		onExport,
	} = useChromeProps();
	const getPuck = useGetPuck();
	const runtime = useStudioRuntime();
	const formats = Array.from(runtime.exportFormats.values());
	const exportEnabled = onExport !== undefined && formats.length > 0;

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button
						variant="default"
						size="sm"
						className="gap-1.5"
						disabled={isPublishing}
						aria-label={msg("studio.publishPanel.trigger")}
					>
						<span>{msg("studio.publishPanel.trigger")}</span>
						<ChevronDown className="size-3.5" aria-hidden="true" />
					</Button>
				}
			/>
			<PopoverPortal>
				<PopoverPositioner sideOffset={6} align="end" className="z-50">
					<PopoverPopup className="w-72 rounded-md border border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)] p-3 text-sm text-[var(--ak-studio-fg)] shadow-md outline-none">
						<header className="mb-2 flex items-baseline justify-between">
							<h3 className="text-sm font-semibold">
								{msg("studio.publishPanel.title")}
							</h3>
							<span className="text-xs text-[var(--ak-studio-muted-fg)]">
								{lastSavedAt !== null
									? msg("studio.publishPanel.savedRelative").replace(
											"{time}",
											formatRelativeTimestamp(lastSavedAt, msg),
										)
									: msg("studio.publishPanel.notSaved")}
							</span>
						</header>

						<section
							className="mb-2"
							aria-label={msg("studio.publishPanel.section.document")}
						>
							<p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--ak-studio-muted-fg)]">
								{msg("studio.publishPanel.section.document")}
							</p>
							<div className="flex flex-col gap-1.5">
								<Button
									variant="outline"
									size="sm"
									className="justify-start"
									onClick={() => {
										if (onSaveDraft !== undefined) void onSaveDraft();
									}}
									disabled={onSaveDraft === undefined || isSavingDraft}
								>
									{isSavingDraft
										? msg("studio.publishPanel.action.saving")
										: msg("studio.publishPanel.action.save")}
								</Button>
								<Button
									variant="default"
									size="sm"
									className="justify-start"
									onClick={() => {
										// Read the LIVE document at click time so the host
										// publishes current edits, not a stale snapshot.
										onPublishClick?.(getPuck().appState.data);
									}}
									disabled={onPublishClick === undefined || isPublishing}
								>
									{isPublishing
										? msg("studio.publishing")
										: msg("studio.publishPanel.action.publish")}
								</Button>
							</div>
						</section>

						<section aria-label={msg("studio.publishPanel.section.export")}>
							<p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--ak-studio-muted-fg)]">
								{msg("studio.publishPanel.section.export")}
							</p>
							<Menu>
								<MenuTrigger
									render={
										<Button
											variant="outline"
											size="sm"
											className="w-full justify-start gap-2"
											disabled={!exportEnabled}
										>
											<Download className="size-4" aria-hidden="true" />
											<span>{msg("studio.publishPanel.section.export")}</span>
										</Button>
									}
								/>
								<MenuPanel sideOffset={4} align="end" className="min-w-[12rem]">
									{formats.length === 0 ? (
										<MenuItem disabled closeOnClick={false}>
											{msg("studio.publishPanel.export.empty")}
										</MenuItem>
									) : (
										formats.map((format) => (
											<MenuItem
												key={format.id}
												disabled={onExport === undefined}
												onClick={() => {
													if (onExport !== undefined) {
														void onExport(format.id);
													}
												}}
											>
												<ExportRow format={format} />
											</MenuItem>
										))
									)}
									{!exportEnabled && formats.length > 0 ? (
										<MenuItem disabled closeOnClick={false}>
											<span className="text-xs text-[var(--ak-studio-muted-fg)]">
												{msg("studio.publishPanel.export.unavailable")}
											</span>
										</MenuItem>
									) : null}
								</MenuPanel>
							</Menu>
						</section>
					</PopoverPopup>
				</PopoverPositioner>
			</PopoverPortal>
		</Popover>
	);
}

function ExportRow({
	format,
}: {
	readonly format: ExportFormatDefinition;
}): ReactNode {
	return (
		<span className="flex w-full items-center justify-between gap-3">
			<span>{format.label}</span>
			<span className="text-xs uppercase text-[var(--ak-studio-muted-fg)]">
				.{format.extension}
			</span>
		</span>
	);
}
