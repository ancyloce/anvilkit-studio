/**
 * @file Studio header bar — brand mark, breadcrumb, collaborator stack,
 * Share / Preview / Publish actions, plus the `<HeaderActions>` slot.
 *
 * Pure presentational component. Wiring to runtime / lifecycle lives
 * in the Phase 5 `<Studio>` glue; this file accepts every callback as
 * a prop so it can be tested in isolation.
 */

import { ChevronLeft, ChevronRight, Play, Users } from "lucide-react";
import { type ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/primitives/avatar";
import { Button } from "@/primitives/button";
import { Separator } from "@/primitives/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { useMsg } from "@/state/editor-i18n-store";
import { cn } from "@/utils/cn";
import { HeaderActions } from "./HeaderActions";

export interface StudioHeaderProps {
	readonly onBack?: () => void;
	readonly onSaveDraft?: () => void | Promise<void>;
	readonly isSavingDraft?: boolean;
	readonly lastSavedAt?: Date | null;
	readonly isPublishing?: boolean;
	readonly onPublishClick?: () => void;
}

interface PlaceholderCollaborator {
	readonly id: string;
	readonly initial: string;
	readonly tone: string;
}

const PLACEHOLDER_COLLABORATORS: readonly PlaceholderCollaborator[] = [
	{ id: "zhao", initial: "赵", tone: "bg-sky-500 text-white" },
	{ id: "qian", initial: "钱", tone: "bg-amber-500 text-white" },
	{ id: "sun", initial: "孙", tone: "bg-emerald-500 text-white" },
];

const PLACEHOLDER_OVERFLOW = 2;

export function StudioHeader({
	onBack,
	onSaveDraft,
	isSavingDraft = false,
	lastSavedAt = null,
	isPublishing = false,
	onPublishClick,
}: StudioHeaderProps): ReactNode {
	const msg = useMsg();

	return (
		<header className="flex h-14 items-center gap-2 border-b border-[var(--ak-studio-border)] bg-[var(--ak-studio-bg)] px-3">
			<div className="flex items-center gap-1">
				<div
					role="presentation"
					aria-hidden="true"
					className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary"
				>
					<BrandMark />
				</div>
				{onBack !== undefined ? (
					<Button
						variant="ghost"
						size="icon"
						onClick={onBack}
						aria-label={msg("studio.back")}
					>
						<ChevronLeft />
					</Button>
				) : null}
			</div>

			<nav
				aria-label="Breadcrumb"
				className="flex min-w-0 flex-1 items-center justify-center"
			>
				<ol className="flex items-center gap-1.5 text-sm">
					<li className="truncate text-[var(--ak-studio-muted-fg)]">
						{msg("studio.breadcrumb.project")}
					</li>
					<li aria-hidden="true" className="text-[var(--ak-studio-muted-fg)]">
						<ChevronRight className="size-3.5" />
					</li>
					<li className="truncate font-medium text-[var(--ak-studio-fg)]">
						{msg("studio.breadcrumb.file")}
					</li>
				</ol>
			</nav>

			<div className="ml-auto flex items-center gap-2">
				{lastSavedAt !== null ? (
					<span className="text-xs text-[var(--ak-studio-muted-fg)]">
						Saved {formatTimestamp(lastSavedAt)}
					</span>
				) : null}

				<CollaboratorStack />

				<Tooltip>
					<TooltipTrigger
						render={
							<Button variant="outline" size="sm" className="gap-1.5">
								<Users className="size-4" aria-hidden="true" />
								<span>{msg("studio.share")}</span>
							</Button>
						}
					/>
					<TooltipContent>{msg("studio.share")}</TooltipContent>
				</Tooltip>

				<Separator
					orientation="vertical"
					className="h-6 data-vertical:self-center"
				/>

				<HeaderActions />

				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								variant="ghost"
								size="icon"
								aria-label={msg("studio.preview")}
							>
								<Play />
							</Button>
						}
					/>
					<TooltipContent>{msg("studio.preview")}</TooltipContent>
				</Tooltip>

				{onSaveDraft !== undefined ? (
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							void onSaveDraft();
						}}
						disabled={isSavingDraft}
					>
						{msg("studio.saveDraft")}
					</Button>
				) : null}

				<Button
					variant="default"
					size="sm"
					onClick={onPublishClick}
					disabled={isPublishing}
				>
					{isPublishing ? msg("studio.publishing") : msg("studio.publish")}
				</Button>
			</div>
		</header>
	);
}

function BrandMark(): ReactNode {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className="size-4"
			aria-hidden="true"
		>
			<rect x="4" y="13" width="3" height="7" rx="1" fill="currentColor" />
			<rect x="10.5" y="9" width="3" height="11" rx="1" fill="currentColor" />
			<rect x="17" y="5" width="3" height="15" rx="1" fill="currentColor" />
		</svg>
	);
}

function CollaboratorStack(): ReactNode {
	const msg = useMsg();
	return (
		<div
			className="flex items-center -space-x-2"
			aria-label={msg("studio.collaborators.label")}
		>
			{PLACEHOLDER_COLLABORATORS.map((collab) => (
				<Avatar
					key={collab.id}
					className="size-7 ring-2 ring-[var(--ak-studio-bg)]"
				>
					<AvatarFallback
						className={cn("text-[11px] font-semibold", collab.tone)}
					>
						{collab.initial}
					</AvatarFallback>
				</Avatar>
			))}
			<Avatar className="size-7 ring-2 ring-[var(--ak-studio-bg)]">
				<AvatarFallback className="bg-[var(--ak-studio-panel)] text-[11px] font-semibold text-[var(--ak-studio-fg)]">
					{msg("studio.collaborators.more").replace(
						"{count}",
						String(PLACEHOLDER_OVERFLOW),
					)}
				</AvatarFallback>
			</Avatar>
		</div>
	);
}

function formatTimestamp(date: Date): string {
	const now = Date.now();
	const diffMs = now - date.getTime();
	const minutes = Math.floor(diffMs / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	return date.toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	});
}
