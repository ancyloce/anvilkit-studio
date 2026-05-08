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
import { PublishPanel } from "./PublishPanel";

export interface StudioHeaderProps {
	readonly onBack?: () => void;
	readonly lastSavedAt?: Date | null;
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
	lastSavedAt = null,
}: StudioHeaderProps): ReactNode {
	const msg = useMsg();

	return (
    <header className="flex h-14 items-center gap-2 border-b border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)] px-3">
      <Button
        variant="ghost"
        size="icon"
        onClick={onBack ?? (() => window.history.back())}
        aria-label={msg("studio.back")}
      >
        <ChevronLeft />
      </Button>
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

        <PublishPanel />
      </div>
    </header>
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
