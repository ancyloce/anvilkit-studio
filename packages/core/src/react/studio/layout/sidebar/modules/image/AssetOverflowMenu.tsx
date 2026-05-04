/**
 * @file Per-asset `…` overflow menu (PRD §7.4).
 *
 * Built-in actions: Rename / Replace / Copy URL / Delete. Plugin
 * contributions from `sidebar-registry-store.assetActions` append below
 * a separator.
 *
 * Built-ins are **always rendered** — the registry contract guarantees
 * the source exposes `rename` / `replace` / `delete` after E.7's
 * registry extension. If a host wires a custom source that omits any
 * of those methods, the menu item still renders but its handler logs
 * + no-ops.
 */

import { MoreHorizontal, Pencil, Trash2, Upload, Link } from "lucide-react";
import { type ReactNode, useState } from "react";

import type {
	StudioAsset,
	StudioAssetAction,
	StudioAssetSource,
} from "../../../../../../types/sidebar.js";
import { DropdownMenu } from "../../../../primitives/DropdownMenu.js";
import { IconButton } from "../../../../primitives/IconButton.js";
import { studioToast } from "../../../../primitives/Toast.js";
import { Tooltip } from "../../../../primitives/Tooltip.js";
import { useMsg } from "../../../../state/editor-i18n-store.js";

export interface AssetOverflowMenuProps {
	readonly asset: StudioAsset;
	readonly source: StudioAssetSource;
	readonly pluginActions: readonly StudioAssetAction[];
	readonly onRename: (asset: StudioAsset) => void;
	readonly onReplace: (asset: StudioAsset) => void;
}

export function AssetOverflowMenu({
	asset,
	source,
	pluginActions,
	onRename,
	onReplace,
}: AssetOverflowMenuProps): ReactNode {
	const msg = useMsg();
	const [copying, setCopying] = useState(false);

	const handleCopy = async (): Promise<void> => {
		if (copying) return;
		setCopying(true);
		try {
			const url =
				(await source.getUrl?.(asset.id)) ?? asset.url ?? "";
			await navigator.clipboard.writeText(url);
			studioToast.success(msg("studio.module.image.actions.copyUrl"));
		} catch (error) {
			studioToast.error(
				error instanceof Error ? error.message : String(error),
			);
		} finally {
			setCopying(false);
		}
	};

	const handleDelete = async (): Promise<void> => {
		const confirmed = window.confirm(
			`${msg("studio.module.image.actions.delete")}: ${asset.name}?`,
		);
		if (!confirmed) return;
		try {
			await source.delete?.(asset.id);
		} catch (error) {
			studioToast.error(
				error instanceof Error ? error.message : String(error),
			);
		}
	};

	return (
		<DropdownMenu.Root>
			<Tooltip content={msg("studio.module.image.actions.more")}>
				<DropdownMenu.Trigger
					render={
						<IconButton
							size="sm"
							aria-label={msg("studio.module.image.actions.more")}
							data-testid={`ak-image-overflow-${asset.id}`}
						>
							<MoreHorizontal className="size-4" aria-hidden="true" />
						</IconButton>
					}
				/>
			</Tooltip>
			<DropdownMenu.Portal>
				<DropdownMenu.Positioner align="end" sideOffset={4}>
					<DropdownMenu.Popup data-testid={`ak-image-overflow-popup-${asset.id}`}>
						<DropdownMenu.Item onClick={() => onRename(asset)}>
							<Pencil className="size-4" aria-hidden="true" />
							<span>{msg("studio.module.image.actions.rename")}</span>
						</DropdownMenu.Item>
						<DropdownMenu.Item onClick={() => onReplace(asset)}>
							<Upload className="size-4" aria-hidden="true" />
							<span>{msg("studio.module.image.actions.replace")}</span>
						</DropdownMenu.Item>
						<DropdownMenu.Item
							onClick={() => {
								void handleCopy();
							}}
						>
							<Link className="size-4" aria-hidden="true" />
							<span>{msg("studio.module.image.actions.copyUrl")}</span>
						</DropdownMenu.Item>
						<DropdownMenu.Item
							tone="destructive"
							onClick={() => {
								void handleDelete();
							}}
						>
							<Trash2 className="size-4" aria-hidden="true" />
							<span>{msg("studio.module.image.actions.delete")}</span>
						</DropdownMenu.Item>
						{pluginActions.length > 0 ? (
							<>
								<DropdownMenu.Separator />
								{pluginActions.map((action) => (
									<DropdownMenu.Item
										key={action.id}
										tone={action.tone === "destructive" ? "destructive" : "default"}
										onClick={() => {
											void action.run({
												asset,
												log: () => {
													// Plugin actions can pass a real logger via the
													// hosting plugin context; the sidebar provides a
													// no-op fallback so action.run can be called
													// without an external dependency injection.
												},
											});
										}}
										data-testid={`ak-image-action-${action.id}`}
									>
										<span>{msg(action.labelKey)}</span>
									</DropdownMenu.Item>
								))}
							</>
						) : null}
					</DropdownMenu.Popup>
				</DropdownMenu.Positioner>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);
}
