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

import { Link, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/primitives/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/primitives/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { useMsg } from "@/state/editor-i18n-store";
import type {
	StudioAsset,
	StudioAssetAction,
	StudioAssetSource,
} from "@/types/sidebar";

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
			const url = (await source.getUrl?.(asset.id)) ?? asset.url ?? "";
			await navigator.clipboard.writeText(url);
			toast.success(msg("studio.module.image.actions.copyUrl"));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
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
			toast.error(error instanceof Error ? error.message : String(error));
		}
	};

	return (
		<DropdownMenu>
			<Tooltip>
				<TooltipTrigger
					render={
						<span className="inline-flex">
							<DropdownMenuTrigger
								render={
									<Button
										size="icon-sm"
										variant="ghost"
										aria-label={msg("studio.module.image.actions.more")}
										data-testid={`ak-image-overflow-${asset.id}`}
									/>
								}
							>
								<MoreHorizontal aria-hidden="true" />
							</DropdownMenuTrigger>
						</span>
					}
				/>
				<TooltipContent>
					{msg("studio.module.image.actions.more")}
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent
				align="end"
				sideOffset={4}
				data-testid={`ak-image-overflow-popup-${asset.id}`}
			>
				<DropdownMenuItem onClick={() => onRename(asset)}>
					<Pencil aria-hidden="true" />
					<span>{msg("studio.module.image.actions.rename")}</span>
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => onReplace(asset)}>
					<Upload aria-hidden="true" />
					<span>{msg("studio.module.image.actions.replace")}</span>
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => {
						void handleCopy();
					}}
				>
					<Link aria-hidden="true" />
					<span>{msg("studio.module.image.actions.copyUrl")}</span>
				</DropdownMenuItem>
				<DropdownMenuItem
					variant="destructive"
					onClick={() => {
						void handleDelete();
					}}
				>
					<Trash2 aria-hidden="true" />
					<span>{msg("studio.module.image.actions.delete")}</span>
				</DropdownMenuItem>
				{pluginActions.length > 0 ? (
					<>
						<DropdownMenuSeparator />
						{pluginActions.map((action) => (
							<DropdownMenuItem
								key={action.id}
								variant={
									action.tone === "destructive" ? "destructive" : "default"
								}
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
							</DropdownMenuItem>
						))}
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
