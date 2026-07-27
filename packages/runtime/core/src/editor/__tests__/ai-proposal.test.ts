/**
 * AI command proposals (PLAN-0020 CORE-P3-008; DD-DEC-014;
 * DD-0019 §21.2).
 */

import type { EditorCommand } from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	AI_PROPOSAL_LIMITS,
	assessProposal,
	commandNodeIds,
	type EditorCommandProposal,
	proposalAffectedNodeIds,
	sanitizeProposalForDisplay,
} from "../ai/proposal.js";

const lockCommand = (nodeIds: readonly string[]): EditorCommand =>
	({
		id: "c1",
		expectedRevision: 0,
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

describe("commandNodeIds", () => {
	it("reads the declared node-bearing shapes", () => {
		expect(commandNodeIds(lockCommand(["a", "b"]))).toEqual(["a", "b"]);
	});

	it("recurses into a batch", () => {
		const batch = {
			id: "b",
			expectedRevision: 0,
			source: "ai",
			timestamp: 0,
			type: "batch",
			commands: [lockCommand(["a"]), lockCommand(["b"])],
		} as unknown as EditorCommand;
		expect(commandNodeIds(batch)).toEqual(["a", "b"]);
	});

	it("contributes nothing for a command that names no nodes", () => {
		const tokenCreate = {
			id: "t",
			expectedRevision: 0,
			source: "ai",
			timestamp: 0,
			type: "token.create",
			token: { id: "tok", name: "n", type: "color", values: {} },
		} as unknown as EditorCommand;
		expect(commandNodeIds(tokenCreate)).toEqual([]);
	});
});

describe("proposalAffectedNodeIds", () => {
	it("deduplicates while preserving first-seen order", () => {
		expect(
			proposalAffectedNodeIds(
				proposal({ commands: [lockCommand(["b", "a"]), lockCommand(["a"])] }),
			),
		).toEqual(["b", "a"]);
	});
});

describe("assessProposal", () => {
	it("accepts a proposal at the current revision", () => {
		const result = assessProposal(proposal(), 3);
		expect(result.status).toBe("ready");
		if (result.status !== "ready") return;
		expect(result.affectedNodeIds).toEqual(["n1"]);
	});

	it("rejects a stale proposal rather than rebasing it", () => {
		// Re-anchoring would apply the model's intent to whatever nodes
		// now hold those ids.
		const result = assessProposal(proposal(), 4);
		expect(result).toMatchObject({
			status: "rejected",
			reason: "stale-revision",
		});
	});

	it("rejects an empty proposal", () => {
		expect(assessProposal(proposal({ commands: [] }), 3)).toMatchObject({
			status: "rejected",
			reason: "empty",
		});
	});

	it("rejects more commands than §21.2 allows", () => {
		const commands = Array.from(
			{ length: AI_PROPOSAL_LIMITS.maxCommands + 1 },
			() => lockCommand(["n1"]),
		);
		expect(assessProposal(proposal({ commands }), 3)).toMatchObject({
			status: "rejected",
			reason: "too-many-commands",
		});
	});

	it("rejects more affected nodes than §21.2 allows", () => {
		const nodeIds = Array.from(
			{ length: AI_PROPOSAL_LIMITS.maxAffectedNodes + 1 },
			(_, i) => `n${i}`,
		);
		expect(
			assessProposal(proposal({ commands: [lockCommand(nodeIds)] }), 3),
		).toMatchObject({ status: "rejected", reason: "too-many-nodes" });
	});

	it("checks staleness before the caps", () => {
		// A stale proposal is refused on that ground regardless of size,
		// so the author sees the actionable reason.
		const commands = Array.from(
			{ length: AI_PROPOSAL_LIMITS.maxCommands + 1 },
			() => lockCommand(["n1"]),
		);
		expect(assessProposal(proposal({ commands }), 99)).toMatchObject({
			reason: "stale-revision",
		});
	});
});

describe("sanitizeProposalForDisplay", () => {
	it("drops the rationale by default (§21.2 no-secrets rule)", () => {
		// Model-authored prose can quote preview rows it was shown.
		const safe = sanitizeProposalForDisplay(
			proposal({ rationale: "because row 3 said secret@example.com" }),
		);
		expect(safe.rationale).toBeUndefined();
		expect(safe.title).toBe("Lock the header");
	});

	it("includes the rationale only on explicit opt-in", () => {
		const safe = sanitizeProposalForDisplay(
			proposal({ rationale: "short reason" }),
			{ includeRationale: true },
		);
		expect(safe.rationale).toBe("short reason");
	});

	it("truncates an over-long title so it cannot be an exfiltration channel", () => {
		const safe = sanitizeProposalForDisplay(
			proposal({ title: "x".repeat(5_000) }),
		);
		expect(safe.title.length).toBeLessThanOrEqual(200);
	});

	it("truncates an over-long rationale when opted in", () => {
		const safe = sanitizeProposalForDisplay(
			proposal({ rationale: "y".repeat(50_000) }),
			{ includeRationale: true },
		);
		expect((safe.rationale ?? "").length).toBeLessThanOrEqual(2_000);
	});
});
