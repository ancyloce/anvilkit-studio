/**
 * @file Merged header action for the `image` module.
 *
 * A single icon button (panel header `[+]`) that opens a menu offering
 * **Upload** and — for a folder-aware local source — **New folder**.
 * Replaces the standalone upload icon: both create-affordances now live
 * behind one trigger so the panel header stays compact.
 *
 * Pure presentation. The actual upload pipeline and folder-creation flow
 * live in `ImageModule`; this component only fires the supplied callbacks.
 * `onCreateFolder` is omitted (and the item hidden) when the active source
 * cannot create folders.
 */

import { FolderPlus, Plus, Upload } from "lucide-react";
import { type ReactNode } from "react";

import {
	Menu,
	MenuItem,
	MenuPanel,
	MenuTrigger,
} from "@/primitives/animate-ui/components/base/menu";
import { Button } from "@/primitives/button";
import { useMsg } from "@/state/editor-i18n-store";

export interface ImageActionsMenuProps {
	readonly onUpload: () => void;
	readonly onCreateFolder?: () => void;
	readonly disabled?: boolean;
}

export function ImageActionsMenu({
	onUpload,
	onCreateFolder,
	disabled,
}: ImageActionsMenuProps): ReactNode {
	const msg = useMsg();
	return (
		<Menu>
			<MenuTrigger
				render={
					<Button
						size="icon-sm"
						variant="ghost"
						disabled={disabled === true}
						aria-label={msg("studio.module.image.actions.add")}
						data-testid="ak-image-actions"
					>
						<Plus aria-hidden="true" />
					</Button>
				}
			/>
			<MenuPanel sideOffset={4} align="end" className="min-w-[10rem]">
				<MenuItem onClick={onUpload} data-testid="ak-image-action-upload">
					<Upload aria-hidden="true" />
					<span>{msg("studio.module.image.upload")}</span>
				</MenuItem>
				{onCreateFolder !== undefined ? (
					<MenuItem
						onClick={onCreateFolder}
						data-testid="ak-image-action-new-folder"
					>
						<FolderPlus aria-hidden="true" />
						<span>{msg("studio.module.image.folder.new")}</span>
					</MenuItem>
				) : null}
			</MenuPanel>
		</Menu>
	);
}
