/**
 * @file `image` module folder navigation (PRD 0002 §7.4): breadcrumb + the
 * current folder's child folders + a "New folder" affordance. Rendered only for
 * a folder-aware source; a flat source shows nothing.
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
	rootLabel,
	newLabel,
	newPromptLabel,
}: {
	readonly folderPath: readonly StudioAssetFolder[];
	readonly folders: readonly StudioAssetFolder[];
	readonly onNavigate: (folderId: string | null) => void;
	readonly onCreateFolder: (name: string) => void;
	readonly rootLabel: string;
	readonly newLabel: string;
	readonly newPromptLabel: string;
}): ReactNode {
	const [creating, setCreating] = useState(false);
	const [name, setName] = useState("");

	const submit = (): void => {
		const trimmed = name.trim();
		if (trimmed !== "") onCreateFolder(trimmed);
		setName("");
		setCreating(false);
	};

	return (
		<div data-testid="ak-image-folder-nav" className="space-y-1">
			<div className="flex items-center justify-between gap-2">
				<nav
					aria-label={rootLabel}
					className="flex flex-wrap items-center gap-1 text-xs"
				>
					<button
						type="button"
						data-folder-crumb="root"
						className="hover:underline"
						aria-current={folderPath.length === 0 ? "page" : undefined}
						onClick={() => onNavigate(null)}
					>
						{rootLabel}
					</button>
					{folderPath.map((folder, index) => (
						<span key={folder.id} className="flex items-center gap-1">
							<span aria-hidden="true">›</span>
							<button
								type="button"
								data-folder-crumb={folder.id}
								className="hover:underline"
								aria-current={
									index === folderPath.length - 1 ? "page" : undefined
								}
								onClick={() => onNavigate(folder.id)}
							>
								{folder.name}
							</button>
						</span>
					))}
				</nav>
				<Button
					variant="ghost"
					size="sm"
					data-testid="ak-image-new-folder"
					onClick={() => setCreating(true)}
				>
					{newLabel}
				</Button>
			</div>
			{creating ? (
				<Input
					value={name}
					placeholder={newPromptLabel}
					data-testid="ak-image-new-folder-input"
					onChange={(event) => setName(event.currentTarget.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") submit();
						if (event.key === "Escape") {
							setName("");
							setCreating(false);
						}
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
