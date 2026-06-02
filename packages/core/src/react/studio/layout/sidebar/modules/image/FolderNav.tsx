/**
 * @file `image` module folder navigation (PRD 0002 §7.4): breadcrumb + the
 * current folder's child folders + an inline "new folder" name input. Rendered
 * only for a folder-aware source; a flat source shows nothing.
 *
 * The "new folder" trigger lives in the panel-header actions menu
 * ({@link ImageActionsMenu}); this component is the controlled name-entry
 * surface — `creating` opens the inline input and `onCreatingChange` closes it.
 */

import { type ReactNode, useState } from "react";

import { Button } from "@/primitives/button";
import { Input } from "@/primitives/input";
import type { StudioAssetFolder } from "@/types/sidebar";

export function FolderNav({
	folderPath,
	folders,
	onNavigate,
	onCreateFolder,
	creating,
	onCreatingChange,
	rootLabel,
	navLabel,
	newPromptLabel,
}: {
	readonly folderPath: readonly StudioAssetFolder[];
	readonly folders: readonly StudioAssetFolder[];
	readonly onNavigate: (folderId: string | null) => void;
	readonly onCreateFolder: (name: string) => void;
	/** Whether the inline name input is open (driven by the header actions menu). */
	readonly creating: boolean;
	readonly onCreatingChange: (creating: boolean) => void;
	readonly rootLabel: string;
	/** Accessible name for the breadcrumb landmark (distinct from `rootLabel`). */
	readonly navLabel: string;
	readonly newPromptLabel: string;
}): ReactNode {
	const [name, setName] = useState("");

	const submit = (): void => {
		const trimmed = name.trim();
		if (trimmed !== "") onCreateFolder(trimmed);
		setName("");
		onCreatingChange(false);
	};

	const cancel = (): void => {
		setName("");
		onCreatingChange(false);
	};

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
			{creating ? (
				<Input
					value={name}
					placeholder={newPromptLabel}
					autoFocus
					data-testid="ak-image-new-folder-input"
					onChange={(event) => setName(event.currentTarget.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") submit();
						if (event.key === "Escape") cancel();
					}}
					onBlur={submit}
				/>
			) : null}
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
