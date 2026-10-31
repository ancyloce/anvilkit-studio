/**
 * @file Shared shapes and pure helpers of the Studio's operation views (P20).
 * The types are the Agent API contract's own (`generated/agent.ts`, vendored
 * from `contracts/openapi/agent.yaml` and checked by
 * `scripts/check-agent-contract.mjs`). The browser talks only to the Studio
 * server under `/api/agent/*`; nothing here fetches.
 */
import type { components } from "./generated/agent";

type Schemas = components["schemas"];

export type OperationView = Schemas["OperationView"];
export type OperationEventFrame = Schemas["OperationEventFrame"];
export type ResetFrame = Schemas["ResetFrame"];
export type CommandReceipt = Schemas["CommandReceipt"];
export type CommandKind = Schemas["CommandKind"];
export type Lifecycle = Schemas["Lifecycle"];
export type Preview = Schemas["Preview"];
export type ErrorEnvelope = Schemas["ErrorEnvelope"];
export type ErrorCode = Schemas["ErrorCode"];

/** The Studio route that forwards `/api/v1/<path>` with the server-held credential. */
export function agentPath(path: string): string {
	return `/api/agent/v1/${path}`;
}

/** A fresh command identity (`Id`); the caller keeps it for every retry of the same command. */
export function newCommandId(prefix: string): string {
	const b = new Uint8Array(12);
	crypto.getRandomValues(b);
	return `${prefix}_${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`;
}

const TERMINAL: ReadonlySet<Lifecycle> = new Set([
	"succeeded",
	"failed",
	"canceled",
]);

export function isTerminal(lifecycle: Lifecycle): boolean {
	return TERMINAL.has(lifecycle);
}

function seq(value: string): bigint {
	return BigInt(value);
}

/**
 * Applies one SSE frame to the snapshot: only a frame newer than the
 * snapshot's revision changes it, so a replayed or reordered frame never moves
 * the view backwards.
 */
export function applyFrame(
	view: OperationView,
	frame: OperationEventFrame,
): OperationView {
	if (
		frame.operationId !== view.operationId ||
		seq(frame.revision) <= seq(view.revision)
	) {
		return seq(frame.eventSeq) > seq(view.coveredEventSeq)
			? { ...view, coveredEventSeq: frame.eventSeq }
			: view;
	}
	const { failureCode, ...payload } = frame.payload;
	const next: OperationView = {
		...view,
		...payload,
		revision: frame.revision,
		coveredEventSeq: frame.eventSeq,
		updatedAt: frame.occurredAt,
	};
	if (failureCode !== undefined) next.failureCode = failureCode;
	return next;
}

/**
 * True when a frame newer than the snapshot moves the operation into
 * `waiting`: the posed question set (`clarification`) travels only in the
 * snapshot, never in a frame, so the view must be re-read or the questions
 * are never shown (B1, 2026-10-28). Replayed frames ask for nothing.
 */
export function needsSnapshot(
	view: OperationView,
	frame: OperationEventFrame,
): boolean {
	return (
		frame.operationId === view.operationId &&
		seq(frame.revision) > seq(view.revision) &&
		frame.payload.lifecycle === "waiting"
	);
}

/** The control commands the projection currently admits (Control decides; this only hides buttons). */
export function availableCommands(view: OperationView): readonly CommandKind[] {
	if (
		isTerminal(view.lifecycle) ||
		view.control === "cancel_pending" ||
		view.control === "cancel_applied"
	)
		return [];
	const out: CommandKind[] = ["cancel"];
	if (
		view.control === "none" &&
		(view.lifecycle === "running" ||
			view.lifecycle === "waiting" ||
			view.lifecycle === "accepted")
	) {
		out.push("hold");
	}
	if (view.control === "hold_applied" || view.lifecycle === "suspended")
		out.push("resume");
	return out;
}

/** Narrows an unknown JSON body to the contract's error envelope. */
export function asErrorEnvelope(body: unknown): ErrorEnvelope | null {
	if (typeof body !== "object" || body === null) return null;
	const error = (body as { error?: unknown }).error;
	if (typeof error !== "object" || error === null) return null;
	const e = error as { code?: unknown; message?: unknown };
	return typeof e.code === "string" && typeof e.message === "string"
		? (body as ErrorEnvelope)
		: null;
}

export async function readJson(response: Response): Promise<unknown> {
	const text = await response.text();
	if (text === "") return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/** Parses an SSE `data` field; `null` when it is not JSON. */
export function parseFrame<T>(data: string): T | null {
	try {
		return JSON.parse(data) as T;
	} catch {
		return null;
	}
}
