/**
 * @file `image` module folder navigation (PRD 0002 §7.4): breadcrumb + the
 * current folder's child folders. Rendered only for a folder-aware source; a
 * flat source shows nothing.
 *
 * Folder creation lives in {@link NewFolderDialog}, opened from the panel-header
 * actions menu ({@link ImageActionsMenu}). This component is navigation only —
 * report 0003 P2-11 hoisted the former inline name input into that dialog.
 */

import type { ReactNode } from "react";

import { Button } from "@/primitives/button";
import type { StudioAssetFolder } from "@/types/sidebar";

export function FolderNav({
	folderPath,
	folders,
	onNavigate,
	rootLabel,
	navLabel,
}: {
	readonly folderPath: readonly StudioAssetFolder[];
	readonly folders: readonly StudioAssetFolder[];
	readonly onNavigate: (folderId: string | null) => void;
	readonly rootLabel: string;
	/** Accessible name for the breadcrumb landmark (distinct from `rootLabel`). */
	readonly navLabel: string;
}): ReactNode {
	return (
		<div data-testid="ak-image-folder-nav" className="space-y-1">
			<nav
				aria-label={navLabel}
				className="flex flex-wrap items-center gap-1 text-xs"
			>
				<Button
					variant="ghost"
					size="sm"
					data-folder-crumb="root"
					className="h-auto px-1 py-0.5 text-xs font-normal hover:underline"
					aria-current={folderPath.length === 0 ? "page" : undefined}
					onClick={() => onNavigate(null)}
				>
					{rootLabel}
				</Button>
				{folderPath.map((folder, index) => (
					<span key={folder.id} className="flex items-center gap-1">
						<span aria-hidden="true">›</span>
						<Button
							variant="ghost"
							size="sm"
							data-folder-crumb={folder.id}
							className="h-auto px-1 py-0.5 text-xs font-normal hover:underline"
							aria-current={
								index === folderPath.length - 1 ? "page" : undefined
							}
							onClick={() => onNavigate(folder.id)}
						>
							{folder.name}
						</Button>
					</span>
				))}
			</nav>
			{folders.length > 0 ? (
				<ul data-testid="ak-image-folder-list" className="flex flex-wrap gap-1">
					{folders.map((folder) => (
						<li key={folder.id}>
							<Button
								variant="outline"
								size="sm"
								data-folder-id={folder.id}
								onClick={() => onNavigate(folder.id)}
							>
								{folder.name}
								{folder.counts ? ` (${folder.counts.assets})` : ""}
							</Button>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
