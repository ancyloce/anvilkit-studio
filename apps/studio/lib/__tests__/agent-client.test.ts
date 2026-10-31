import { describe, expect, it } from "vitest";
import {
	applyFrame,
	asErrorEnvelope,
	availableCommands,
	needsSnapshot,
	type OperationView,
} from "../agent/operation-client";
import { forwardable } from "../agent/platform";
import {
	acceptsAnswers,
	formatAnswer,
	parseReferences,
} from "../agent/preparation-client";
import { isSourcePath, readTar, TarError, writeTar } from "../agent/tar";
import { changedPaths } from "../agent/workbench-files";

const digest = `sha256:${"a".repeat(64)}`;

function view(overrides: Partial<OperationView> = {}): OperationView {
	return {
		operationId: "op_1",
		tenantId: "tenant_a",
		actorId: "user_a",
		kind: "preparation",
		subject: { profileId: "preparation-v1", subjectDigest: digest },
		lifecycle: "running",
		phase: "analysis",
		control: "none",
		cleanup: "not_required",
		finance: "funded",
		revision: "3",
		coveredEventSeq: "5",
		executionEpoch: "1",
		createdAt: "2026-09-30T00:00:00Z",
		updatedAt: "2026-09-30T00:00:00Z",
		deadline: "2026-09-30T01:00:00Z",
		...overrides,
	};
}

const frame = (
	revision: string,
	eventSeq: string,
	lifecycle: OperationView["lifecycle"] = "waiting",
) => ({
	operationId: "op_1",
	eventSeq,
	transitionId: `tr_${eventSeq}`,
	eventType: "operation.changed" as const,
	revision,
	occurredAt: "2026-09-30T00:00:05Z",
	payload: {
		lifecycle,
		phase: "clarification",
		control: "none" as const,
		cleanup: "not_required" as const,
		finance: "funded" as const,
	},
});

describe("operation client", () => {
	it("applies only frames newer than the snapshot", () => {
		const v = view();
		const next = applyFrame(v, frame("4", "6"));
		expect(next.lifecycle).toBe("waiting");
		expect(next.revision).toBe("4");
		expect(next.coveredEventSeq).toBe("6");
		const replay = applyFrame(next, frame("3", "5", "running"));
		expect(replay.lifecycle).toBe("waiting");
		expect(replay.revision).toBe("4");
	});

	it("re-reads the snapshot when a newer frame enters waiting (the question set is snapshot-only)", () => {
		const v = view();
		expect(needsSnapshot(v, frame("4", "6"))).toBe(true);
		expect(needsSnapshot(v, frame("4", "6", "running"))).toBe(false);
		expect(needsSnapshot(v, frame("3", "5"))).toBe(false);
		expect(needsSnapshot(view({ operationId: "op_2" }), frame("4", "6"))).toBe(
			false,
		);
		// The frame alone never carries the clarification the form renders from.
		expect(applyFrame(v, frame("4", "6")).clarification).toBeUndefined();
	});

	it("admits commands by projection state", () => {
		expect(availableCommands(view())).toEqual(["cancel", "hold"]);
		expect(
			availableCommands(
				view({ control: "hold_applied", lifecycle: "suspended" }),
			),
		).toEqual(["cancel", "resume"]);
		expect(availableCommands(view({ control: "cancel_pending" }))).toEqual([]);
		expect(availableCommands(view({ lifecycle: "succeeded" }))).toEqual([]);
	});

	it("recognizes the contract's error envelope only", () => {
		expect(
			asErrorEnvelope({
				error: {
					code: "NOT_FOUND",
					message: "x",
					requestId: "r",
					retryable: false,
				},
			})?.error.code,
		).toBe("NOT_FOUND");
		expect(
			asErrorEnvelope({ code: "NOT_FOUND", message: "legacy" }),
		).toBeNull();
	});
});

describe("preparation client", () => {
	const clarification = {
		questionSetId: "qs_1",
		questionSetRevision: "1",
		round: "1",
		askedAt: "2026-09-30T00:00:00Z",
		expiresAt: "2026-09-30T02:00:00Z",
		questions: [
			{ questionId: "q1", text: "Audience?" },
			{ questionId: "q2", text: "Tone?" },
		],
	};

	it("accepts answers only while waiting within the round", () => {
		const waiting = view({ lifecycle: "waiting", clarification });
		expect(acceptsAnswers(waiting, new Date("2026-09-30T01:00:00Z"))).toBe(
			true,
		);
		expect(acceptsAnswers(waiting, new Date("2026-09-30T03:00:00Z"))).toBe(
			false,
		);
		expect(acceptsAnswers(view({ clarification }))).toBe(false);
	});

	it("formats every answer in question order, or nothing", () => {
		expect(
			formatAnswer(clarification, {
				q2: "calm",
				q1: "developers\nand designers",
			}),
		).toBe("- q1: developers and designers\n- q2: calm\n");
		expect(formatAnswer(clarification, { q1: "x", q2: " " })).toBeNull();
	});

	it("parses sourceId@revision references", () => {
		expect(parseReferences("src_a@3, src_b@10")).toEqual([
			{ sourceId: "src_a", revision: "3" },
			{ sourceId: "src_b", revision: "10" },
		]);
		expect(parseReferences("")).toEqual([]);
		expect(parseReferences("src_a@03")).toBeNull();
		expect(parseReferences("../x@1")).toBeNull();
	});
});

describe("Studio proxy allowlist", () => {
	it("forwards the contract's routes and methods only", () => {
		expect(forwardable("operations/op_1", "GET")).toBe(true);
		expect(forwardable("operations/op_1/events", "GET")).toBe(true);
		expect(forwardable("operations/op_1/commands", "POST")).toBe(true);
		expect(
			forwardable(`operations/op_1/preview/artifacts/${digest}`, "GET"),
		).toBe(true);
		expect(forwardable("mcp/grants/g_1/revocations", "POST")).toBe(true);
		expect(forwardable("knowledge/sources/src_1", "DELETE")).toBe(true);
		expect(forwardable("operations/op_1", "DELETE")).toBe(false);
		expect(forwardable("artifacts/transfers", "POST")).toBe(false);
		expect(forwardable("operations/../admin", "GET")).toBe(false);
		expect(forwardable("operations//x", "GET")).toBe(false);
	});

	it("P2.7: access text round-trips manage entries", async () => {
		const { formatAccess, parseAccess } = await import("../agent/management");
		const parsed = parseAccess("tenant:tenant_a, manage:actor:bob");
		expect(parsed).toEqual([
			{ principalType: "tenant", principalId: "tenant_a" },
			{ principalType: "actor", principalId: "bob", permission: "manage" },
		]);
		expect(formatAccess(parsed ?? [])).toBe(
			"tenant:tenant_a, manage:actor:bob",
		);
		expect(parseAccess("manage:bob")).toBeNull();
	});

	it("P2.6: forwards snapshots and recall, never the upload capability", () => {
		expect(forwardable("knowledge/snapshots", "POST")).toBe(true);
		expect(forwardable("knowledge/snapshots/snap_1", "GET")).toBe(true);
		expect(forwardable("memories/recalls", "POST")).toBe(true);
		expect(forwardable("knowledge/sources/uploads", "POST")).toBe(false);
	});
});

describe("source archive", () => {
	const enc = (s: string) => new TextEncoder().encode(s);

	it("round-trips deterministically and sorted", () => {
		const a = writeTar([
			{ path: "src/b.tsx", bytes: enc("export const b = 1;\n") },
			{ path: "package.json", bytes: enc("{}\n") },
		]);
		const b = writeTar([
			{ path: "package.json", bytes: enc("{}\n") },
			{ path: "src/b.tsx", bytes: enc("export const b = 1;\n") },
		]);
		expect(a).toEqual(b);
		const files = readTar(a);
		expect(files.map((f) => f.path)).toEqual(["package.json", "src/b.tsx"]);
		expect(new TextDecoder().decode(files[1]?.bytes)).toBe(
			"export const b = 1;\n",
		);
	});

	it("keeps long paths through the ustar prefix", () => {
		const long = `${"d".repeat(60)}/${"e".repeat(60)}/file.ts`;
		expect(readTar(writeTar([{ path: long, bytes: enc("x") }]))[0]?.path).toBe(
			long,
		);
	});

	it("refuses escaping paths and duplicates", () => {
		expect(isSourcePath("../x")).toBe(false);
		expect(isSourcePath("/etc/passwd")).toBe(false);
		expect(isSourcePath("a/./b")).toBe(false);
		expect(() => writeTar([{ path: "../x", bytes: enc("") }])).toThrow(
			TarError,
		);
		expect(() =>
			writeTar([
				{ path: "a", bytes: enc("") },
				{ path: "a", bytes: enc("") },
			]),
		).toThrow(TarError);
	});

	it("refuses a link entry and a truncated archive", () => {
		const archive = writeTar([{ path: "a.ts", bytes: enc("x") }]);
		const link = archive.slice();
		link[156] = "2".charCodeAt(0);
		// fix the checksum so only the type is wrong
		let sum = 0;
		for (let i = 0; i < 512; i++)
			sum += i >= 148 && i < 156 ? 32 : (link[i] ?? 0);
		link.set(
			new TextEncoder().encode(`${sum.toString(8).padStart(6, "0")}\0 `),
			148,
		);
		expect(() => readTar(link)).toThrow(/entry type/);
		expect(() => readTar(archive.slice(0, 600))).toThrow(TarError);
	});

	it("reads a PAX path record", () => {
		const long = `${"p".repeat(120)}.ts`;
		const record = (k: string, v: string) => {
			const body = ` ${k}=${v}\n`;
			let n = body.length + 1;
			while (`${n}${body}`.length !== n) n = `${n}${body}`.length;
			return `${n}${body}`;
		};
		const paxBody = enc(record("path", long));
		const base = writeTar([
			{ path: "PaxHeader", bytes: paxBody },
			{ path: "short.ts", bytes: enc("y") },
		]);
		// Turn the first entry into an `x` header (entries are sorted: PaxHeader < short.ts).
		base[156] = "x".charCodeAt(0);
		let sum = 0;
		for (let i = 0; i < 512; i++)
			sum += i >= 148 && i < 156 ? 32 : (base[i] ?? 0);
		base.set(
			new TextEncoder().encode(`${sum.toString(8).padStart(6, "0")}\0 `),
			148,
		);
		expect(readTar(base).map((f) => f.path)).toEqual([long]);
	});

	it("names changed paths", () => {
		expect(
			changedPaths(
				[
					{ path: "a", text: "1" },
					{ path: "b", text: "2" },
				],
				[
					{ path: "a", text: "1" },
					{ path: "b", text: "3" },
				],
			),
		).toEqual(["b"]);
	});
});
