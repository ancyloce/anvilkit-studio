"use client";

/**
 * @file `TokenPicker` — the single token-picker UX for the page
 * editor (PLAN-0020 CORE-P2-002; DD-0019 §15.1; ADR 0005 Part 2 §4).
 *
 * ADR 0005 requires **one** picker pattern across editors: filter by
 * compatible type, search, recents, provenance badge
 * (Document / Theme / Brand), resolved value with alias chain,
 * detach-to-literal, create-from-literal. The page editor surfaces
 * document tokens plus theme values via import-as-copy; brand tokens
 * stay canvas-scoped.
 *
 * Applying to a multi-selection is atomic by construction: the write
 * goes through one `InspectorFieldHandle.commit`, which fans out to
 * every capable node in a single command (one history entry).
 */

import type { JsonValue, TokenType } from "@anvilkit/contracts/editor";
import { type ReactNode, useState } from "react";
import { Button } from "@/primitives/button";
import { Input } from "@/primitives/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/primitives/popover";
import { ScrollArea } from "@/primitives/scroll-area";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import type { EditorInspectorContext } from "../inspector/use-inspector.js";
import { type TokenPickerEntry, useTokenPicker } from "./use-token-picker.js";

/** Props for {@link TokenPicker}. */
export interface TokenPickerProps {
	readonly context: EditorInspectorContext;
	/** Only tokens of this type are offered (§15.1 compatible type). */
	readonly type: TokenType;
	/** The attached token id, when the field currently holds a token. */
	readonly attachedTokenId?: string;
	/** Apply a document token to the field. */
	readonly onAttach: (tokenId: string) => void;
	/**
	 * Write the token's resolved literal back to the field
	 * ("detach by writing the resolved literal", §15.1). Absent while
	 * the value cannot be materialized.
	 */
	readonly onDetach?: () => void;
	/** The field's current literal, offered as create-from-literal. */
	readonly currentLiteral?: JsonValue;
	readonly testId?: string;
}

const ORIGIN_LABEL_KEY = {
	document: "studio.editor.tokens.origin.document",
	theme: "studio.editor.tokens.origin.theme",
	brand: "studio.editor.tokens.origin.brand",
} as const;

function previewOf(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (typeof value === "object" && value !== null) {
		const record = value as Record<string, unknown>;
		if (record.kind === "hex" && typeof record.value === "string") {
			return record.value;
		}
		if (record.kind === "unit" && typeof record.value === "number") {
			return `${record.value}${String(record.unit ?? "")}`;
		}
		if (record.kind === "keyword" && typeof record.keyword === "string") {
			return record.keyword;
		}
	}
	return "";
}

/** The token badge + picker popover bound to one inspector field. */
export function TokenPicker({
	context,
	type,
	attachedTokenId,
	onAttach,
	onDetach,
	currentLiteral,
	testId,
}: TokenPickerProps): ReactNode {
	const msg = useMsg();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const picker = useTokenPicker(context, type, (tokenId) => {
		onAttach(tokenId);
		setOpen(false);
	});

	const attached = attachedTokenId;

	const renderEntry = (entry: TokenPickerEntry): ReactNode => (
		<li key={entry.token.id}>
			<button
				type="button"
				onClick={() => picker.attach(entry.token.id)}
				aria-current={entry.token.id === attached ? "true" : undefined}
				className={cn(
					"flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-[var(--ak-studio-hover)]",
					entry.token.id === attached ? "bg-[var(--ak-studio-hover)]" : null,
				)}
				data-testid="ak-token-option"
			>
				<span className="flex-1 truncate font-mono">{entry.path}</span>
				<span className="text-[10px] text-[var(--ak-studio-muted-fg)]">
					{msg(ORIGIN_LABEL_KEY[entry.origin])}
				</span>
				<span
					className={cn(
						"font-mono text-[10px]",
						entry.unresolved
							? "text-red-500"
							: "text-[var(--ak-studio-muted-fg)]",
					)}
				>
					{entry.unresolved
						? msg("studio.editor.tokens.unresolved")
						: previewOf(entry.resolvedValue)}
				</span>
				{entry.chain.length > 1 ? (
					<span
						className="text-[10px] text-[var(--ak-studio-muted-fg)]"
						title={entry.chain.map((step) => step.name).join(" → ")}
						data-testid="ak-token-chain"
					>
						{entry.chain.map((step) => step.name).join(" → ")}
					</span>
				) : null}
			</button>
		</li>
	);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant={attached === undefined ? "ghost" : "secondary"}
						size="sm"
						className="h-7 shrink-0 px-2 text-[11px]"
						aria-label={msg("studio.editor.tokens.open")}
						data-testid={testId ?? "ak-token-picker-trigger"}
					/>
				}
			>
				{attached === undefined
					? msg("studio.editor.tokens.attach")
					: msg("studio.editor.inspector.tokenValue")}
			</PopoverTrigger>
			<PopoverContent className="w-72 p-2" align="end">
				<Input
					type="search"
					value={picker.search}
					onChange={(event) => picker.setSearch(event.target.value)}
					placeholder={msg("studio.editor.tokens.search")}
					aria-label={msg("studio.editor.tokens.search")}
					className="h-7 text-xs"
					data-testid="ak-token-search"
				/>

				{picker.recents.length > 0 && picker.search.trim() === "" ? (
					<>
						<p className="mt-2 px-2 text-[10px] uppercase text-[var(--ak-studio-muted-fg)]">
							{msg("studio.editor.tokens.recent")}
						</p>
						<ul>{picker.recents.map(renderEntry)}</ul>
					</>
				) : null}

				<ScrollArea className="mt-2 max-h-48">
					{picker.entries.length === 0 ? (
						<p
							className="px-2 py-3 text-center text-xs text-[var(--ak-studio-muted-fg)]"
							data-testid="ak-token-empty"
						>
							{msg("studio.editor.tokens.empty")}
						</p>
					) : (
						<ul>{picker.entries.map(renderEntry)}</ul>
					)}
				</ScrollArea>

				{picker.importable.length > 0 ? (
					<>
						<p className="mt-2 px-2 text-[10px] uppercase text-[var(--ak-studio-muted-fg)]">
							{msg("studio.editor.tokens.import")}
						</p>
						<ul data-testid="ak-token-importable">
							{picker.importable.map((value) => (
								<li key={`${value.system}:${value.ref}`}>
									<button
										type="button"
										onClick={() => void picker.importValue(value)}
										className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-[var(--ak-studio-hover)]"
										data-testid="ak-token-import-option"
									>
										<span className="flex-1 truncate">{value.label}</span>
										<span className="text-[10px] text-[var(--ak-studio-muted-fg)]">
											{msg(ORIGIN_LABEL_KEY[value.system])}
										</span>
									</button>
								</li>
							))}
						</ul>
					</>
				) : null}

				{currentLiteral !== undefined ? (
					<div className="mt-2 flex items-center gap-1 border-t border-[var(--ak-studio-border)] pt-2">
						<Input
							type="text"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder={msg("studio.editor.tokens.newName")}
							aria-label={msg("studio.editor.tokens.newName")}
							className="h-7 flex-1 text-xs"
							data-testid="ak-token-new-name"
						/>
						<Button
							type="button"
							size="sm"
							variant="secondary"
							className="h-7 px-2 text-[11px]"
							disabled={name.trim() === ""}
							onClick={() => {
								void picker.createFromLiteral(name, currentLiteral);
								setName("");
							}}
							data-testid="ak-token-create"
						>
							{msg("studio.editor.tokens.create")}
						</Button>
					</div>
				) : null}

				{attached !== undefined && onDetach !== undefined ? (
					<Button
						type="button"
						size="sm"
						variant="ghost"
						className="mt-2 h-7 w-full text-[11px]"
						onClick={() => {
							onDetach();
							setOpen(false);
						}}
						data-testid="ak-token-detach"
					>
						{msg("studio.editor.tokens.detach")}
					</Button>
				) : null}
			</PopoverContent>
		</Popover>
	);
}
