"use client";

/**
 * @file `DocumentTokenPicker` — the token picker on the canonical read
 * model (PLAN-0028 `p4-003`; ADR 0005 Part 2 §4; DD-0019 §15.1).
 *
 * The rebase of `tokens/TokenPicker.tsx`. The UX is ADR 0005's, kept
 * element for element — filter by compatible type, search, recents,
 * provenance badge, resolved value with alias chain, detach-to-literal,
 * create-from-literal — because that list is a contract, not a
 * preference. What changes is everything underneath it:
 *
 * | | retained picker | this one |
 * |---|---|---|
 * | tokens | `EditorInspectorContext.authoring.tokens` (sidecar) | `useDocumentModel().designSystem` (declared root prop) |
 * | create | `commands.execute({type:"token.create"})` | `useDesignSystemCommit()` — one `setData`, one undo |
 * | recents | private module array | the shared `token-recents.ts` store |
 *
 * It needs no editor bridge and no command port, so it renders under a
 * bare `<Puck>` — the composition shell's stated design goal.
 *
 * ### A reference is not a literal
 *
 * The trigger renders in `secondary` variant with the
 * `studio.editor.inspector.tokenValue` label and
 * `data-token-derived="true"` when the field holds a token reference,
 * and in `ghost` with "Token" when it holds a literal. That is the
 * read-side half of the provenance display `p4-001` renders in the
 * Style panel — same distinction, same attribute, so a test can assert
 * it once.
 *
 * ### The document is read only while the popover is open
 *
 * The choices live in a child that mounts on open. A panel can then
 * render one picker per row — the Design System panel's alias control
 * does — without paying a `readDocument` walk per closed picker.
 * `readDocument`'s caches make a warm read cheap, but `walkTree`
 * rebuilds the tree it visits (measured in `p2-001`), so N closed
 * pickers would still be N traversals per render. Mounting on open
 * makes that cost exactly one.
 */

import type { JsonValue, TokenType } from "@anvilkit/contracts/editor";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Button } from "@/primitives/button";
import { Input } from "@/primitives/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/primitives/popover";
import { ScrollArea } from "@/primitives/scroll-area";
import { cn } from "@/shared/cn";
import { randomId } from "@/shared/node-id";
import { useMsg } from "@/state/editor-i18n-context";
import { formatTokenLiteral } from "../../tokens/token-literal-text.js";
import { FALLBACK_TOKEN_MODE } from "../../tokens/token-mode.js";
import { useDocumentModel } from "../../use-document-model.js";
import { useDesignSystemCommit } from "../use-design-system-commit.js";
import { readTokenChoices, type TokenChoice } from "./read-design-system.js";
import { useRememberToken, useTokenRecents } from "./token-recents.js";

const ORIGIN_LABEL_KEY = {
	document: "studio.editor.tokens.origin.document",
	theme: "studio.editor.tokens.origin.theme",
	brand: "studio.editor.tokens.origin.brand",
} as const;

/** Props for {@link DocumentTokenPicker}. */
export interface DocumentTokenPickerProps {
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
	/** Token ids never offered — e.g. the token being edited itself. */
	readonly excludeTokenIds?: readonly string[];
	readonly testId?: string;
}

/** The token badge + picker popover for one field. */
export function DocumentTokenPicker(
	props: DocumentTokenPickerProps,
): ReactNode {
	const msg = useMsg();
	const [open, setOpen] = useState(false);
	const attached = props.attachedTokenId;

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
						data-testid={props.testId ?? "ak-token-picker-trigger"}
						data-token-derived={attached === undefined ? "false" : "true"}
					/>
				}
			>
				{attached === undefined
					? msg("studio.editor.tokens.attach")
					: msg("studio.editor.inspector.tokenValue")}
			</PopoverTrigger>
			<PopoverContent className="w-72 p-2" align="end">
				{open ? (
					<TokenChoices {...props} onClose={() => setOpen(false)} />
				) : null}
			</PopoverContent>
		</Popover>
	);
}

/** The popover body — mounted only while the picker is open. */
function TokenChoices({
	type,
	attachedTokenId,
	onAttach,
	onDetach,
	currentLiteral,
	excludeTokenIds,
	onClose,
}: DocumentTokenPickerProps & {
	readonly onClose: () => void;
}): ReactNode {
	const msg = useMsg();
	const model = useDocumentModel();
	const commit = useDesignSystemCommit();
	const recentIds = useTokenRecents();
	const rememberToken = useRememberToken();
	const [search, setSearch] = useState("");
	const [name, setName] = useState("");

	const mode = model.designSystem?.defaultTokenMode ?? FALLBACK_TOKEN_MODE;
	const allChoices = useMemo(
		() => readTokenChoices(model.designSystem, type, mode),
		[model.designSystem, type, mode],
	);
	const choices = useMemo(() => {
		const excluded = new Set(excludeTokenIds ?? []);
		const needle = search.trim().toLowerCase();
		return allChoices.filter(
			(entry) =>
				!excluded.has(entry.token.id) &&
				(needle === "" ||
					entry.path.toLowerCase().includes(needle) ||
					entry.token.name.toLowerCase().includes(needle)),
		);
	}, [allChoices, excludeTokenIds, search]);
	const recents = useMemo(
		() =>
			recentIds
				.map((id) => choices.find((entry) => entry.token.id === id))
				.filter((entry): entry is TokenChoice => entry !== undefined),
		[choices, recentIds],
	);

	const attach = (tokenId: string): void => {
		rememberToken(tokenId);
		onAttach(tokenId);
		onClose();
	};

	/**
	 * Create a token from the field's literal, then attach it. The
	 * create is one `setData` (one undo); the attach is the caller's own
	 * intent on its own carrier, and only runs if the create committed —
	 * a rejected create must never leave a field pointing at a token
	 * that does not exist.
	 */
	const createFromLiteral = (): void => {
		const trimmed = name.trim();
		if (trimmed.length === 0 || currentLiteral === undefined) return;
		const tokenId = randomId();
		const result = commit((current) => {
			const base = current ?? {
				breakpoints: [],
				tokens: {},
				tokenModes: {},
				defaultTokenMode: FALLBACK_TOKEN_MODE,
				styleDefinitions: {},
			};
			return {
				...base,
				tokens: {
					...base.tokens,
					[tokenId]: {
						id: tokenId,
						path: trimmed.split(".").filter((segment) => segment !== ""),
						name: trimmed,
						type,
						values: {
							[base.defaultTokenMode]: {
								kind: "literal" as const,
								value: currentLiteral,
							},
						},
					},
				},
			};
		});
		setName("");
		if (result.status === "committed") attach(tokenId);
	};

	const renderChoice = (entry: TokenChoice): ReactNode => {
		const resolved = entry.resolution;
		return (
			<li key={entry.token.id}>
				<button
					type="button"
					onClick={() => attach(entry.token.id)}
					aria-current={entry.token.id === attachedTokenId ? "true" : undefined}
					className={cn(
						"flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors hover:bg-[var(--ak-studio-hover)]",
						// The attached row uses the brand-tinted selection token,
						// not the neutral hover token — otherwise the current
						// token looks identical to whatever row the pointer is over.
						entry.token.id === attachedTokenId
							? "bg-[var(--ak-studio-layer-selection)]"
							: null,
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
							resolved.status === "resolved"
								? "text-[var(--ak-studio-muted-fg)]"
								: "text-[var(--destructive)]",
						)}
					>
						{resolved.status === "resolved"
							? formatTokenLiteral(entry.token.type, resolved.value).text
							: msg("studio.editor.tokens.unresolved")}
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
	};

	return (
		<>
			<Input
				type="search"
				value={search}
				onChange={(event) => setSearch(event.target.value)}
				placeholder={msg("studio.editor.tokens.search")}
				aria-label={msg("studio.editor.tokens.search")}
				className="h-7 text-xs"
				data-testid="ak-token-search"
			/>

			{recents.length > 0 && search.trim() === "" ? (
				<>
					<p className="mt-2 px-2 text-[10px] uppercase text-[var(--ak-studio-muted-fg)]">
						{msg("studio.editor.tokens.recent")}
					</p>
					<ul>{recents.map(renderChoice)}</ul>
				</>
			) : null}

			<ScrollArea className="mt-2 max-h-48">
				{choices.length === 0 ? (
					<p
						className="px-2 py-3 text-center text-xs text-[var(--ak-studio-muted-fg)]"
						data-testid="ak-token-empty"
					>
						{msg("studio.editor.tokens.empty")}
					</p>
				) : (
					<ul>{choices.map(renderChoice)}</ul>
				)}
			</ScrollArea>

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
						onClick={createFromLiteral}
						data-testid="ak-token-create"
					>
						{msg("studio.editor.tokens.create")}
					</Button>
				</div>
			) : null}

			{attachedTokenId !== undefined && onDetach !== undefined ? (
				<Button
					type="button"
					size="sm"
					variant="ghost"
					className="mt-2 h-7 w-full text-[11px]"
					onClick={() => {
						onDetach();
						onClose();
					}}
					data-testid="ak-token-detach"
				>
					{msg("studio.editor.tokens.detach")}
				</Button>
			) : null}
		</>
	);
}
