/**
 * @file `PropertyResetButton` — the label-row reset affordance for
 * fields whose component config declares a reliable default (see
 * `use-field-default.ts`).
 *
 * The button is ALWAYS rendered once a field qualifies (stable DOM
 * shape — a presence-toggled button would restructure the label row
 * mid-keystroke and remount the input, dropping focus) but is
 * `invisible` + `disabled` while the value matches the default:
 * visibility-hidden content is neither focusable nor exposed to
 * assistive tech, so unmodified properties stay visually and
 * semantically quiet.
 */

import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/primitives/button";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";

export interface PropertyResetButtonProps {
	/** Whether the current value differs from the configured default. */
	readonly modified: boolean;
	readonly onReset: () => void;
}

export function PropertyResetButton({
	modified,
	onReset,
}: PropertyResetButtonProps): ReactNode {
	const msg = useMsg();
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			aria-label={msg("studio.field.reset")}
			disabled={!modified}
			className={cn(
				"text-[var(--ak-studio-muted-fg)] hover:text-[var(--ak-studio-fg)]",
				!modified && "invisible",
			)}
			onClick={onReset}
			data-testid="ak-field-reset"
		>
			<RotateCcw aria-hidden="true" />
		</Button>
	);
}
