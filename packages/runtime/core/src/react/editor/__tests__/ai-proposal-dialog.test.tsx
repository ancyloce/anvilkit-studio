/**
 * `AiProposalDialog` — the §21.2 review-and-confirm gate
 * (PLAN-0020 CORE-P3-008; DD-DEC-014).
 *
 * The rules worth pinning are the ones that protect the author: a stale
 * proposal cannot be applied, the model's rationale is not shown by
 * default, and confirming goes through the ordinary command port (so
 * the edit lands in normal Puck history and the editor's own Undo works
 * — §21.2 step 6).
 */

import type {
	EditorCommand,
} from "../../../editor/legacy/index.js";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_MESSAGES,
	EditorI18nProvider,
} from "@/state/editor-i18n-context";
import type { EditorCommandProposal } from "../../../editor/index.js";
import { AiProposalDialog } from "../ai/AiProposalDialog.js";
import type { EditorInspectorContext } from "../inspector/use-inspector.js";

const lockCommand = (nodeIds: readonly string[]): EditorCommand =>
	({
		id: "c1",
		expectedRevision: 3,
		source: "ai",
		timestamp: 0,
		type: "node.lock.set",
		nodeIds,
		locked: true,
	}) as EditorCommand;

function proposal(
	patch: Partial<EditorCommandProposal> = {},
): EditorCommandProposal {
	return {
		id: "p1",
		title: "Lock the header",
		commands: [lockCommand(["n1"])],
		expectedRevision: 3,
		requiresConfirmation: true,
		...patch,
	};
}

/** Minimal context: the dialog only reads `commands` and `revision`. */
function contextWith(
	execute = vi.fn(async (_command: EditorCommand) => ({
		status: "changed" as const,
		errors: [],
	})),
	revision = 3,
): { context: EditorInspectorContext; execute: typeof execute } {
	const context = {
		revision,
		commands: {
			execute,
			preview: () => ({ valid: true, errors: [], changedNodeIds: ["n1"] }),
			validate: () => [],
			getSnapshot: () => ({}) as never,
		},
	} as unknown as EditorInspectorContext;
	return { context, execute };
}

afterEach(() => {
	cleanup();
});

describe("AiProposalDialog", () => {
	it("renders nothing without a proposal", () => {
		const { context } = contextWith();
		render(
			<EditorI18nProvider>
				<AiProposalDialog context={context} proposal={null} onClose={vi.fn()} />
			</EditorI18nProvider>,
		);
		expect(screen.queryByTestId("ak-ai-proposal-dialog")).toBeNull();
	});

	it("shows the title and a content-free diff summary", () => {
		const { context } = contextWith();
		render(
			<EditorI18nProvider>
				<AiProposalDialog
					context={context}
					proposal={proposal()}
					onClose={vi.fn()}
				/>
			</EditorI18nProvider>,
		);
		expect(screen.getByTestId("ak-ai-proposal-title").textContent).toBe(
			"Lock the header",
		);
		// Counts, not content (§21.2 forbids exposing values in the diff).
		expect(screen.getByTestId("ak-ai-proposal-commands").textContent).toBe("1");
		expect(screen.getByTestId("ak-ai-proposal-nodes").textContent).toBe("1");
	});

	it("hides the model's rationale by default", () => {
		const { context } = contextWith();
		render(
			<EditorI18nProvider>
				<AiProposalDialog
					context={context}
					proposal={proposal({ rationale: "row 3 said secret@example.com" })}
					onClose={vi.fn()}
				/>
			</EditorI18nProvider>,
		);
		expect(screen.queryByTestId("ak-ai-proposal-rationale")).toBeNull();
	});

	it("shows the rationale only on explicit opt-in", () => {
		const { context } = contextWith();
		render(
			<EditorI18nProvider>
				<AiProposalDialog
					context={context}
					proposal={proposal({ rationale: "short reason" })}
					onClose={vi.fn()}
					includeRationale
				/>
			</EditorI18nProvider>,
		);
		expect(screen.getByTestId("ak-ai-proposal-rationale").textContent).toBe(
			"short reason",
		);
	});

	it("confirms through the ordinary command port", async () => {
		const { context, execute } = contextWith();
		const onClose = vi.fn();
		render(
			<EditorI18nProvider>
				<AiProposalDialog
					context={context}
					proposal={proposal()}
					onClose={onClose}
				/>
			</EditorI18nProvider>,
		);
		fireEvent.click(screen.getByTestId("ak-ai-proposal-confirm"));

		await waitFor(() => expect(execute).toHaveBeenCalledOnce());
		// A single-command proposal submits as-is, not wrapped.
		expect(execute.mock.calls[0]?.[0]).toMatchObject({
			type: "node.lock.set",
		});
		await waitFor(() => expect(onClose).toHaveBeenCalled());
	});

	it("cannot confirm a stale proposal", () => {
		// The document moved on, so the node ids may now address
		// different content — §21.2 invalidates rather than rebases.
		const { context, execute } = contextWith(undefined, 9);
		render(
			<EditorI18nProvider>
				<AiProposalDialog
					context={context}
					proposal={proposal()}
					onClose={vi.fn()}
				/>
			</EditorI18nProvider>,
		);
		const confirm = screen.getByTestId(
			"ak-ai-proposal-confirm",
		) as HTMLButtonElement;
		expect(confirm.disabled).toBe(true);

		fireEvent.click(confirm);
		expect(execute).not.toHaveBeenCalled();
		expect(screen.getByTestId("ak-ai-proposal-errors")).toBeTruthy();
	});

	// REVIEW-0019 §2 P2: this surface used to render `error.message` — an
	// English literal minted by the React-free engine — so a zh/ja/ko
	// author read English rejection reasons (EP-23 AC breach).
	it("renders rejection errors from the catalog, not engine English", () => {
		const { context } = contextWith(undefined, 9);
		render(
			<EditorI18nProvider>
				<AiProposalDialog
					context={context}
					proposal={proposal()}
					onClose={vi.fn()}
				/>
			</EditorI18nProvider>,
		);
		const list = screen.getByTestId("ak-ai-proposal-errors");
		const item = list.querySelector("li");
		expect(item?.getAttribute("data-error-code")).toBe(
			"EDITOR_COMMAND_CONFLICT",
		);
		expect(item?.textContent).toBe(
			DEFAULT_MESSAGES["studio.editor.error.commandConflict"],
		);
		// The engine's raw message stays reachable for developers, but is
		// not the rendered label.
		expect(item?.getAttribute("title")).toContain("revision");
		expect(item?.textContent).not.toContain("revision");
	});

	it("localizes rejection errors — a zh author sees no English", () => {
		const { context } = contextWith(undefined, 9);
		const zhError = "此为中文错误文本";
		render(
			// `messages` is the per-instance override channel, which is what
			// a non-`en` resolved catalog looks like to this component.
			<EditorI18nProvider
				messages={{ "studio.editor.error.commandConflict": zhError }}
			>
				<AiProposalDialog
					context={context}
					proposal={proposal()}
					onClose={vi.fn()}
				/>
			</EditorI18nProvider>,
		);
		expect(
			screen.getByTestId("ak-ai-proposal-errors").querySelector("li")
				?.textContent,
		).toBe(zhError);
	});

	it("dismisses without executing anything", () => {
		const { context, execute } = contextWith();
		const onClose = vi.fn();
		render(
			<EditorI18nProvider>
				<AiProposalDialog
					context={context}
					proposal={proposal()}
					onClose={onClose}
				/>
			</EditorI18nProvider>,
		);
		fireEvent.click(screen.getByTestId("ak-ai-proposal-cancel"));
		expect(onClose).toHaveBeenCalledOnce();
		expect(execute).not.toHaveBeenCalled();
	});
});
