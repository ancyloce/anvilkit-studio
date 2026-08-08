"use client";

/**
 * @file `CreateComponentDialog` — name a component before capturing it
 * (PLAN-0020 CORE-P2-009H; ED-COMP-001; DD-0019 §14.3).
 *
 * The capture used to commit with the literal name `"Component"`,
 * which made every definition in a document indistinguishable in the
 * library and in the layer tree. This dialog supplies the name.
 *
 * ### Why it is not part of the toolbar
 *
 * The canvas selection toolbar renders **inside the canvas iframe**
 * (it is portalled into the overlay root, a sibling of `#frame-root`).
 * A modal there would be trapped in the iframe: wrong stacking
 * context, wrong focus scope, wrong escape handling. So the toolbar
 * files a request on the bridge and this component — mounted in the
 * main document beside the rest of the editor chrome — picks it up.
 *
 * The capture itself is one `commitCreateComponent`, therefore one
 * history-recording `setData`, therefore one undo (§10.5). `p5-006`
 * made it synchronous — the carrier commit needs no dynamically
 * imported engine chunk, so there is no longer an await to hold the
 * dialog open across.
 */

import type { EditorError } from "@anvilkit/contracts/editor";
import type { ReactNode } from "react";
import {
	use,
	useCallback,
	useEffect,
	useState,
	useSyncExternalStore,
} from "react";
import { Button } from "@/primitives/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/primitives/dialog";
import { Input } from "@/primitives/input";
import { useMsg } from "@/state/editor-i18n-context";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";
import { useCreateComponent } from "./use-create-component.js";

/** The default a user can accept without typing. */
const DEFAULT_NAME = "Component";

/**
 * The naming dialog. Renders nothing until the canvas files a capture
 * request, so it costs one subscription and no DOM in the common case.
 */
export function CreateComponentDialog(): ReactNode {
	const msg = useMsg();
	const bridge = use(StudioEditorBridgeContext);
	const create = useCreateComponent();
	useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? zero : bridge.getVersion,
		bridge === null ? zero : bridge.getVersion,
	);
	const pending = bridge?.componentCapture.pending() ?? null;
	const [name, setName] = useState(DEFAULT_NAME);
	const [errors, setErrors] = useState<readonly EditorError[]>([]);
	const [busy, setBusy] = useState(false);

	// Each new request starts from the default rather than the previous
	// answer: reusing a stale name is how duplicate definitions happen.
	useEffect(() => {
		if (pending !== null) {
			setName(DEFAULT_NAME);
			setErrors([]);
		}
	}, [pending]);

	const close = useCallback(() => {
		bridge?.componentCapture.clear();
	}, [bridge]);

	const confirm = useCallback(() => {
		if (create === null || pending === null) {
			close();
			return;
		}
		const trimmed = name.trim();
		if (trimmed.length === 0) {
			return;
		}
		setBusy(true);
		try {
			// The nodes the toolbar validated and filed — NOT whatever is
			// selected by the time the user finishes typing.
			const outcome = create.create(trimmed, pending);
			if (outcome.status === "committed") {
				close();
				return;
			}
			setErrors(outcome.errors);
		} finally {
			// Always clears. Without it a rejected capture (an unavailable
			// `crypto.randomUUID` on an insecure origin, a throwing commit)
			// left every control in this modal disabled, and the dialog
			// renders no close button.
			setBusy(false);
		}
	}, [create, name, close, pending]);

	if (pending === null) {
		return null;
	}

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) close();
			}}
		>
			<DialogContent
				data-testid="ak-create-component-dialog"
				showCloseButton={false}
			>
				<DialogHeader>
					<DialogTitle>
						{msg("studio.editor.component.createFromSelection")}
					</DialogTitle>
				</DialogHeader>
				<Input
					autoFocus
					value={name}
					aria-label={msg("studio.editor.component.nameLabel")}
					placeholder={msg("studio.editor.component.nameLabel")}
					data-testid="ak-create-component-name"
					onChange={(event) => setName(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							confirm();
						}
					}}
				/>
				{errors.length > 0 ? (
					<ul
						className="flex flex-col gap-1 text-[11px] text-[var(--destructive)]"
						data-testid="ak-create-component-errors"
						role="status"
						aria-live="polite"
					>
						{errors.map((error) => (
							<li key={`${error.code}:${error.message}`}>{error.message}</li>
						))}
					</ul>
				) : null}
				<DialogFooter className="mt-2">
					{/* Never disabled: there is no close button, so cancel is the
					    only way out and must survive an in-flight capture. */}
					<Button
						type="button"
						variant="ghost"
						onClick={close}
						data-testid="ak-create-component-cancel"
					>
						{msg("studio.editor.component.delete.cancel")}
					</Button>
					<Button
						type="button"
						disabled={busy || name.trim().length === 0}
						onClick={confirm}
						data-testid="ak-create-component-confirm"
					>
						{msg("studio.editor.component.createFromSelection")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function noopSubscribe(): () => void {
	return noop;
}
function noop(): void {
	// The no-bridge store never changes.
}
function zero(): number {
	return 0;
}
