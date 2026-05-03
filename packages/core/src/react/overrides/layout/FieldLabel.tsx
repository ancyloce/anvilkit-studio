/**
 * @file `FieldLabel` — Puck `fieldLabel` override.
 *
 * Replaces the default field label with a token-styled variant that
 * surfaces a read-only marker and an optional help slot. Puck's
 * compound override receives `{ children, icon, label, el, readOnly,
 * className }` — `children` is the rendered field input; we mount it
 * underneath the label.
 */

import { Lock } from "lucide-react";
import { type ReactNode } from "react";

import { cn } from "../utils/cn.js";

export interface FieldLabelOverrideProps {
	readonly children?: ReactNode;
	readonly icon?: ReactNode;
	readonly label: string;
	readonly el?: "label" | "div";
	readonly readOnly?: boolean;
	readonly className?: string;
}

export function FieldLabel({
	children,
	icon,
	label,
	el = "label",
	readOnly = false,
	className,
}: FieldLabelOverrideProps): ReactNode {
	const Tag = el;
	return (
		<Tag
			className={cn(
				"flex flex-col gap-1.5 text-sm text-[var(--ak-studio-fg)]",
				className,
			)}
		>
			<span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--ak-studio-muted-fg)]">
				{icon}
				<span>{label}</span>
				{readOnly ? (
					<Lock
						aria-label="Read-only"
						className="size-3 text-[var(--ak-studio-muted-fg)]"
					/>
				) : null}
			</span>
			{children}
		</Tag>
	);
}
