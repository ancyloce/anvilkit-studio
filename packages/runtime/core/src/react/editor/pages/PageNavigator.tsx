"use client";

/**
 * @file `PageNavigator` — host page navigation UI
 * (PLAN-0020 CORE-P3-010; ED-PAGE-001; DD-0019 §18).
 *
 * §18, verbatim: "Without an adapter, page navigation is hidden. Core
 * does not persist page trees or include page switches in Puck
 * history."
 *
 * All three clauses are already structural in `usePageAdapter`; this is
 * the surface that makes them visible. It renders `null` when the hook
 * does — so a Studio with no page adapter shows nothing at all, rather
 * than an empty list that looks like a broken feature.
 *
 * `create` and `rename` appear **only** when the host implements them,
 * because the hook omits them otherwise. A read-only page source
 * therefore cannot render a button that would throw on click.
 */

import { type ReactNode, useState } from "react";
import { Button } from "@/primitives/button";
import { Input } from "@/primitives/input";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import { usePageAdapter } from "./use-page-adapter.js";

/** Props for {@link PageNavigator}. */
export interface PageNavigatorProps {
	/** Highlighted row, when the host tracks a current page. */
	readonly activePageId?: string;
}

/** The §18 page list; `null` without a host adapter. */
export function PageNavigator({ activePageId }: PageNavigatorProps): ReactNode {
	const msg = useMsg();
	const nav = usePageAdapter();
	const [newName, setNewName] = useState("");
	const [busy, setBusy] = useState(false);

	if (nav === null) return null;

	const create = nav.create;

	async function onCreate(): Promise<void> {
		const name = newName.trim();
		if (name === "" || busy || create === undefined) return;
		setBusy(true);
		try {
			await create(name);
			setNewName("");
		} finally {
			setBusy(false);
		}
	}

	return (
		<section
			className="flex flex-col gap-2 p-2"
			aria-label={msg("studio.editor.pages.title")}
			data-testid="ak-page-navigator"
		>
			{nav.status === "loading" ? (
				<p
					className="text-[11px] text-[var(--ak-studio-muted-fg)]"
					data-testid="ak-page-loading"
				>
					{msg("studio.editor.pages.loading")}
				</p>
			) : null}

			{nav.status === "failed" ? (
				// The host's message, not a generic one — an author can act on
				// "page service down" but not on "something went wrong".
				<p
					className="text-[11px] text-[var(--ak-studio-danger-fg,#b42318)]"
					data-testid="ak-page-error"
				>
					{nav.message}
				</p>
			) : null}

			{nav.status === "ready" && nav.pages.length === 0 ? (
				<p
					className="text-[11px] text-[var(--ak-studio-muted-fg)]"
					data-testid="ak-page-empty"
				>
					{msg("studio.editor.pages.empty")}
				</p>
			) : null}

			<ul className="flex flex-col gap-0.5">
				{nav.pages.map((page) => (
					<li key={page.id}>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className={cn(
								"h-6 w-full justify-start px-2 text-[11px] transition-colors",
								page.id === activePageId &&
									"bg-[var(--ak-studio-layer-selection)]",
							)}
							aria-current={page.id === activePageId ? "page" : undefined}
							onClick={() => {
								// Straight to the host — never the command port, so a
								// page switch cannot enter Puck history (§18).
								void nav.open(page.id);
							}}
							data-testid="ak-page-open"
							data-page-id={page.id}
						>
							{page.name}
						</Button>
					</li>
				))}
			</ul>

			{create !== undefined ? (
				<div className="flex items-center gap-1">
					<Input
						value={newName}
						onChange={(event) => setNewName(event.target.value)}
						placeholder={msg("studio.editor.pages.newPlaceholder")}
						aria-label={msg("studio.editor.pages.newLabel")}
						className="h-7 min-w-0 flex-1 text-[11px]"
						data-testid="ak-page-new-name"
					/>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 px-2 text-[11px]"
						disabled={newName.trim() === "" || busy}
						onClick={() => {
							void onCreate();
						}}
						data-testid="ak-page-create"
					>
						{msg("studio.editor.pages.create")}
					</Button>
				</div>
			) : null}
		</section>
	);
}
