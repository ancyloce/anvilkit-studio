/**
 * @file `FieldsPanel` — Puck `fields` override.
 *
 * Wraps the field tree with a breadcrumb header so the user can
 * see the active selection chain. Puck passes `{ children,
 * isLoading, itemSelector }`; we surface a loading affordance on
 * mount and render the breadcrumbs from the live snapshot.
 */

import { ChevronRight } from "lucide-react";
import { type ReactNode } from "react";
import { useBreadcrumbs } from "@/overrides/utils/breadcrumbs";
import { useMsg } from "@/state/editor-i18n-store";
import { cn } from "@/utils/cn";

interface ItemSelector {
	readonly index: number;
	readonly zone?: string;
}

export interface FieldsPanelOverrideProps {
	readonly children: ReactNode;
	readonly isLoading: boolean;
	readonly itemSelector?: ItemSelector | null;
	readonly className?: string;
}

export function FieldsPanel({
	children,
	isLoading,
	itemSelector,
	className,
}: FieldsPanelOverrideProps): ReactNode {
	const msg = useMsg();
	const crumbs = useBreadcrumbs();

	return (
    <div className={cn("flex h-full min-h-0 flex-col gap-2", className)}>
      {crumbs.length > 0 ? (
        <nav
          aria-label="selection breadcrumbs"
          className="flex items-center gap-0.5 text-xs text-[var(--ak-studio-muted-fg)]"
        >
          {crumbs.map((crumb, index) => (
            <span key={crumb.id} className="flex items-center gap-0.5">
              <span
                className={
                  index === crumbs.length - 1
                    ? "font-medium text-[var(--ak-studio-fg)]"
                    : ""
                }
              >
                {crumb.label}
              </span>
              {index < crumbs.length - 1 ? (
                <ChevronRight className="size-3 opacity-60" />
              ) : null}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex-1 overflow-auto">
        {itemSelector === null || itemSelector === undefined ? (
          <p className="px-1 py-2 text-xs text-[var(--ak-studio-muted-fg)]">
            {msg("studio.fields.empty")}
          </p>
        ) : (
          <div
            className={cn(
              "flex flex-col gap-0",
              isLoading ? "animate-pulse opacity-70" : null,
            )}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
