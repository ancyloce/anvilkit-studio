#!/usr/bin/env node
/**
 * A test double of the AnvilKit Agent API `/api/v1` for the Studio's browser
 * acceptance of the generation progress views (plan 0005 Phase 3, §6 rows
 * B2–B5 in synthetic form). It replays the recorded operation streams of
 * `./agent-generation/*.jsonl` as if they happened now (one frame every
 * `--step-ms`), serves the snapshot, the SSE stream with `Last-Event-ID` /
 * `after`, `retry`, heartbeats and close-after-terminal, creates
 * preparations and generations idempotently by `commandId`, and serves a
 * small source archive with `Anvilkit-Source-Digest`. Test hooks under
 * `/__double/*` inject the failure shapes the client must survive:
 * disconnect, reset with missing history, 429 with Retry-After, 403, a lost
 * create response, and the fixture of the next generation.
 *
 * It is not the platform: nothing here proves Control, Workflow, the team
 * or the validator. It only lets a browser exercise the client rules.
 *
 *   node e2e/fixtures/agent-api-double.mjs --port 4780 --token double-token
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};
const PORT = Number(option("port", process.env.DOUBLE_PORT ?? "4780"));
const TOKEN = option("token", process.env.DOUBLE_TOKEN ?? "double-token");
const STEP_MS = Number(option("step-ms", process.env.DOUBLE_STEP_MS ?? "300"));
const HEARTBEAT_MS = 2000;

const fixtures = {
	preparation: load("preparation.jsonl"),
	"generation-success": load("generation-success.jsonl"),
	"generation-failed": load("generation-failed.jsonl"),
	"generation-model-error": load("generation-model-error.jsonl"),
};
function load(name) {
	return readFileSync(path.join(here, "agent-generation", name), "utf8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));
}

const id = (prefix) =>
	`${prefix}_${randomBytes(10)
		.toString("base64url")
		.replace(/[^A-Za-z0-9]/g, "")
		.slice(0, 16)
		.toUpperCase()}`;
const now = () => new Date().toISOString();
const sha256 = (b) => `sha256:${createHash("sha256").update(b).digest("hex")}`;

/** A one-file ustar archive (the "source" of a completed generation). */
function sourceTar(operationId) {
	const body = Buffer.from(
		`# ${operationId}\n\nSynthetic source of the Agent API double.\n`,
	);
	const header = Buffer.alloc(512);
	header.write("README.md", 0, "utf8");
	header.write("0000644\0", 100);
	header.write("0000000\0", 108);
	header.write("0000000\0", 116);
	header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124);
	header.write(
		`${Math.floor(Date.now() / 1000)
			.toString(8)
			.padStart(11, "0")}\0`,
		136,
	);
	header.write("        ", 148);
	header.write("0", 156);
	header.write("ustar\0", 257);
	header.write("00", 263);
	let sum = 0;
	for (const byte of header) sum += byte;
	header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
	const padded = Buffer.alloc(Math.ceil(body.length / 512) * 512);
	body.copy(padded);
	return Buffer.concat([header, padded, Buffer.alloc(1024)]);
}

/** @type {Map<string, Operation>} */
const operations = new Map();
/** @type {Map<string, {operationId: string, digest: string}>} */
const commands = new Map();
const briefs = new Set();
const control = {
	busy: new Map(), // operationId → remaining 429 answers
	forbid: new Set(), // operationId → events answer 403
	reset: new Map(), // operationId → { historyFrom }
	loseNextCreate: false,
	nextGenerationFixture: "generation-success",
	eventRequests: new Map(), // operationId → count
	sockets: new Map(), // operationId → Set<ServerResponse>
};

class Operation {
	constructor(kind, fixture, subject, commandId) {
		this.operationId = id("op");
		this.kind = kind;
		this.subject = subject;
		this.commandId = commandId;
		this.createdAt = Date.now();
		this.frames = fixture.map((f) => ({
			...f,
			operationId: this.operationId,
			transitionId: f.transitionId
				.replace("OP", this.operationId)
				.replace("BRIEF", subject.briefId ?? "BRIEF"),
		}));
		this.source = sourceTar(this.operationId);
	}
	/** Frames that "happened" by now. */
	available() {
		const n = Math.min(
			this.frames.length,
			Math.floor((Date.now() - this.createdAt) / STEP_MS) + 1,
		);
		return this.frames.slice(0, n);
	}
	complete() {
		return this.available().length === this.frames.length;
	}
	view() {
		const avail = this.available();
		const last = avail[avail.length - 1];
		const p = last?.payload ?? {
			lifecycle: "accepted",
			phase: "intake",
			control: "none",
			cleanup: "not_required",
			finance: "not_funded",
		};
		const v = {
			operationId: this.operationId,
			tenantId: "tenant_a",
			actorId: "user_a",
			kind: this.kind,
			subject: this.subject,
			lifecycle: p.lifecycle,
			phase: p.phase,
			control: p.control,
			cleanup: p.cleanup,
			finance: p.finance,
			revision: last?.revision ?? "0",
			coveredEventSeq: last?.eventSeq ?? "0",
			executionEpoch: "1",
			createdAt: new Date(this.createdAt).toISOString(),
			updatedAt: last?.occurredAt ?? new Date(this.createdAt).toISOString(),
			deadline: new Date(this.createdAt + 3_600_000).toISOString(),
		};
		if (p.failureCode) v.failureCode = p.failureCode;
		const bound = [...avail].reverse().find((f) => f.payload.step);
		if (bound) {
			const bp = bound.payload;
			v.progress = {
				step: bp.step,
				visit: bp.visit,
				attemptOrdinal: bp.attemptOrdinal,
				eventSeq: bound.eventSeq,
			};
			if (bp.node) v.progress.node = bp.node;
			if (bp.nodeState) v.progress.nodeState = bp.nodeState;
			if (bp.round) v.progress.round = bp.round;
		}
		return v;
	}
}

function json(res, status, body, headers = {}) {
	const text = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json",
		"cache-control": "no-store",
		...headers,
	});
	res.end(text);
}
const envelope = (res, status, code, message, retryable, headers) =>
	json(
		res,
		status,
		{ error: { code, message, requestId: id("req"), retryable } },
		headers,
	);

async function readBody(req) {
	const chunks = [];
	for await (const c of req) chunks.push(c);
	const text = Buffer.concat(chunks).toString("utf8");
	return text ? JSON.parse(text) : null;
}

function streamEvents(req, res, op) {
	const url = new URL(req.url, "http://double");
	const after = url.searchParams.get("after");
	const lastEventId = req.headers["last-event-id"];
	let cursor = BigInt(after ?? lastEventId ?? "0");
	control.eventRequests.set(
		op.operationId,
		(control.eventRequests.get(op.operationId) ?? 0) + 1,
	);
	if (control.forbid.has(op.operationId)) {
		return envelope(
			res,
			403,
			"FORBIDDEN",
			"The caller may not read this operation.",
			false,
		);
	}
	const busy = control.busy.get(op.operationId) ?? 0;
	if (busy > 0) {
		control.busy.set(op.operationId, busy - 1);
		return envelope(res, 429, "CAPACITY_EXHAUSTED", "Too many streams.", true, {
			"retry-after": "1",
		});
	}
	res.writeHead(200, {
		"content-type": "text/event-stream",
		"cache-control": "no-store",
		connection: "keep-alive",
	});
	res.write("retry: 500\n\n");
	const reset = control.reset.get(op.operationId);
	if (reset && cursor < BigInt(reset.historyFrom) - 1n) {
		// Events before historyFrom are no longer retained: the client must
		// take the snapshot's coveredEventSeq as its baseline.
		const covered = op.view().coveredEventSeq;
		res.write(
			`event: reset_required\ndata: ${JSON.stringify({ operationId: op.operationId, coveredEventSeq: covered })}\n\n`,
		);
		control.reset.delete(op.operationId);
		res.end();
		return;
	}
	const sockets = control.sockets.get(op.operationId) ?? new Set();
	sockets.add(res);
	control.sockets.set(op.operationId, sockets);
	let lastBeat = Date.now();
	const tick = setInterval(() => {
		for (const f of op.available()) {
			if (BigInt(f.eventSeq) <= cursor) continue;
			cursor = BigInt(f.eventSeq);
			res.write(
				`id: ${f.eventSeq}\nevent: operation.changed\ndata: ${JSON.stringify(f)}\n\n`,
			);
		}
		if (
			op.complete() &&
			cursor >= BigInt(op.frames[op.frames.length - 1].eventSeq)
		) {
			// The server closes a terminal stream after its last event.
			clearInterval(tick);
			sockets.delete(res);
			res.end();
			return;
		}
		if (Date.now() - lastBeat >= HEARTBEAT_MS) {
			lastBeat = Date.now();
			res.write(": heartbeat\n\n");
		}
	}, 50);
	req.on("close", () => {
		clearInterval(tick);
		sockets.delete(res);
	});
}

const server = createServer(async (req, res) => {
	const url = new URL(req.url, "http://double");
	const p = url.pathname;
	try {
		if (p.startsWith("/__double/")) return testHook(req, res, p);
		if (req.headers.authorization !== `Bearer ${TOKEN}`) {
			return envelope(res, 401, "UNAUTHENTICATED", "No credential.", false);
		}
		const operationMatch = /^\/api\/v1\/operations\/([^/]+)$/.exec(p);
		const eventsMatch = /^\/api\/v1\/operations\/([^/]+)\/events$/.exec(p);
		const sourceMatch = /^\/api\/v1\/operations\/([^/]+)\/source$/.exec(p);
		if (req.method === "POST" && p === "/api/v1/artifacts/transfers") {
			const body = await readBody(req);
			return json(res, 201, {
				transferId: id("xfer"),
				handle: id("hdl"),
				state: "finalized",
				class: body?.class ?? "prompt",
				mediaType: body?.mediaType ?? "text/plain",
				expectedDigest: body?.expectedDigest,
				expectedSize: body?.expectedSize,
				createdAt: now(),
			});
		}
		if (req.method === "POST" && p === "/api/v1/preparations") {
			const body = await readBody(req);
			return create(res, "preparation", "preparation", body, {
				profileId: "preparation-v1",
				subjectDigest: body?.prompt?.digest ?? sha256("x"),
				briefId: id("brf"),
			});
		}
		if (req.method === "POST" && p === "/api/v1/operations") {
			const body = await readBody(req);
			if (body?.kind !== "generation")
				return envelope(
					res,
					400,
					"INVALID_ARGUMENT",
					"Only generation is doubled.",
					false,
				);
			if (!briefs.has(body.subject?.briefId))
				return envelope(res, 404, "NOT_FOUND", "No such brief.", false);
			if (control.loseNextCreate) {
				// The operation is created, the answer never arrives: the client
				// must retry the identical command id and receive the original.
				control.loseNextCreate = false;
				createOperation(
					"generation",
					control.nextGenerationFixture,
					body,
					body.subject,
				);
				res.socket?.destroy();
				return;
			}
			return create(
				res,
				"generation",
				control.nextGenerationFixture,
				body,
				body.subject,
			);
		}
		if (operationMatch && req.method === "GET") {
			const op = operations.get(operationMatch[1]);
			if (!op)
				return envelope(res, 404, "NOT_FOUND", "No such operation.", false);
			return json(res, 200, op.view());
		}
		if (eventsMatch && req.method === "GET") {
			const op = operations.get(eventsMatch[1]);
			if (!op)
				return envelope(res, 404, "NOT_FOUND", "No such operation.", false);
			return streamEvents(req, res, op);
		}
		if (sourceMatch && req.method === "GET") {
			const op = operations.get(sourceMatch[1]);
			if (!op)
				return envelope(res, 404, "NOT_FOUND", "No such operation.", false);
			res.writeHead(200, {
				"content-type": "application/x-tar",
				"anvilkit-source-digest": sha256(op.source),
				"anvilkit-source-revision": "1",
				"anvilkit-source-lineage": sha256(op.operationId),
				"x-content-type-options": "nosniff",
			});
			return res.end(op.source);
		}
		return envelope(
			res,
			404,
			"NOT_FOUND",
			`Not doubled: ${req.method} ${p}`,
			false,
		);
	} catch (err) {
		return envelope(res, 500, "DEPENDENCY_UNAVAILABLE", String(err), true);
	}
});

function createOperation(kind, fixtureName, body, subject) {
	const op = new Operation(
		kind,
		fixtures[fixtureName],
		subject,
		body.commandId,
	);
	operations.set(op.operationId, op);
	commands.set(body.commandId, {
		operationId: op.operationId,
		digest: sha256(JSON.stringify(subject)),
	});
	if (kind === "preparation") briefs.add(subject.briefId);
	return op;
}

function create(res, kind, fixtureName, body, subject) {
	if (!body?.commandId)
		return envelope(res, 400, "INVALID_ARGUMENT", "commandId required.", false);
	const known = commands.get(body.commandId);
	if (known) {
		if (
			known.digest !== sha256(JSON.stringify(subject)) &&
			kind === "generation"
		) {
			return envelope(
				res,
				409,
				"IDEMPOTENCY_CONFLICT",
				"The command id was used with another request.",
				false,
			);
		}
		return json(res, 202, operations.get(known.operationId).view());
	}
	const op = createOperation(kind, fixtureName, body, subject);
	return json(res, 202, op.view());
}

async function testHook(req, res, p) {
	if (p === "/__double/state") {
		return json(res, 200, {
			operations: [...operations.values()].map((o) => ({
				operationId: o.operationId,
				kind: o.kind,
				commandId: o.commandId,
				briefId: o.subject.briefId,
				frames: o.frames.length,
				available: o.available().length,
				sourceDigest: sha256(o.source),
				eventRequests: control.eventRequests.get(o.operationId) ?? 0,
			})),
		});
	}
	if (p === "/__double/control" && req.method === "POST") {
		const body = await readBody(req);
		switch (body.action) {
			case "disconnect":
				for (const s of control.sockets.get(body.operationId) ?? [])
					s.socket?.destroy();
				break;
			case "reset":
				control.reset.set(body.operationId, {
					historyFrom: String(body.historyFrom ?? 1),
				});
				for (const s of control.sockets.get(body.operationId) ?? [])
					s.socket?.destroy();
				break;
			case "busy":
				control.busy.set(body.operationId, Number(body.count ?? 1));
				for (const s of control.sockets.get(body.operationId) ?? [])
					s.socket?.destroy();
				break;
			case "forbid":
				control.forbid.add(body.operationId);
				for (const s of control.sockets.get(body.operationId) ?? [])
					s.socket?.destroy();
				break;
			case "lose-next-create":
				control.loseNextCreate = true;
				break;
			case "fixture":
				if (!fixtures[body.fixture])
					return envelope(
						res,
						400,
						"INVALID_ARGUMENT",
						"unknown fixture",
						false,
					);
				control.nextGenerationFixture = body.fixture;
				break;
			default:
				return envelope(res, 400, "INVALID_ARGUMENT", "unknown action", false);
		}
		return json(res, 200, { ok: true });
	}
	return envelope(res, 404, "NOT_FOUND", "no such hook", false);
}

server.listen(PORT, "127.0.0.1", () => {
	console.log(
		`agent-api-double listening on http://127.0.0.1:${PORT} (step ${STEP_MS} ms)`,
	);
});
