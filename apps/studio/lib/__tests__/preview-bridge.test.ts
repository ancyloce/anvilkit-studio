import { afterEach, describe, expect, it } from "vitest";
import {
	PreviewSession,
	type SessionState,
	sha256Text,
} from "../agent/preview-bridge";

/**
 * A scripted stand-in for the preview frame's window: it receives the
 * bootstrap, keeps the transferred port and answers as the test says. The
 * real frame is exercised in a browser by jobs/validator's preview-origin
 * test and the Studio Playwright flow.
 */
class FakeFrame {
	port: MessagePort | undefined;
	bootstrap: Record<string, unknown> | undefined;
	targetOrigin: string | undefined;
	received: Record<string, unknown>[] = [];
	private seq = 0;

	postMessage(
		message: unknown,
		targetOrigin: string,
		transfer: MessagePort[],
	): void {
		this.bootstrap = message as Record<string, unknown>;
		this.targetOrigin = targetOrigin;
		this.port = transfer[0];
		if (this.port)
			this.port.onmessage = (ev) =>
				this.received.push(ev.data as Record<string, unknown>);
	}

	send(
		message: Record<string, unknown>,
		overrides: Record<string, unknown> = {},
	): void {
		this.seq += 1;
		this.port?.postMessage({
			session: this.bootstrap?.session,
			seq: this.seq,
			...message,
			...overrides,
		});
	}

	ready(hostProfileId = "host-abi-dev-v1"): void {
		this.send({ type: "ready", nonce: this.bootstrap?.nonce, hostProfileId });
	}
}

const sessions: PreviewSession[] = [];

function open(
	frame: FakeFrame,
	states: SessionState[] = [],
	renderTimeoutMs?: number,
): PreviewSession {
	const s = new PreviewSession({
		frame: frame as unknown as Window,
		parentOrigin: "http://localhost:3000",
		hostProfileId: "host-abi-dev-v1",
		onState: (st) => states.push(st),
		readyTimeoutMs: 2000,
		renderTimeoutMs,
	});
	sessions.push(s);
	return s;
}

afterEach(() => {
	for (const s of sessions.splice(0)) s.close("test end");
});

const until = async (check: () => boolean) => {
	for (let i = 0; i < 200 && !check(); i++)
		await new Promise((r) => setTimeout(r, 5));
	expect(check()).toBe(true);
};

describe("PreviewSession", () => {
	it("bootstraps once, binds the session and renders verified bytes", async () => {
		const frame = new FakeFrame();
		const s = open(frame);
		expect(frame.targetOrigin).toBe("*");
		expect(frame.bootstrap).toMatchObject({
			type: "anvilkit.preview.bootstrap",
			protocol: "anvilkit-preview-v1",
			parentOrigin: "http://localhost:3000",
		});
		expect(String(frame.bootstrap?.session)).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
		expect(String(frame.bootstrap?.nonce)).toMatch(/^[0-9a-f]{32,64}$/);
		frame.ready();
		expect(await s.whenReady()).toBe(true);
		const text = "export default { render: () => null };";
		const pending = s.render({
			previewRevision: "4",
			puckType: "Preview",
			module: { digest: await sha256Text(text), text },
			styles: [],
			props: {},
		});
		await until(() => frame.received.length === 1);
		expect(frame.received[0]).toMatchObject({
			type: "render",
			seq: 1,
			previewRevision: "4",
			session: s.session,
		});
		frame.send({ type: "rendered", renderSeq: 1, previewRevision: "4" });
		expect(await pending).toEqual({ kind: "rendered", previewRevision: "4" });
	});

	it("never sends bytes that do not match their digest", async () => {
		const frame = new FakeFrame();
		const s = open(frame);
		frame.ready();
		await s.whenReady();
		const outcome = await s.render({
			previewRevision: "4",
			puckType: "Preview",
			module: { digest: await sha256Text("other"), text: "export default {}" },
			styles: [],
			props: {},
		});
		expect(outcome).toEqual({ kind: "error", code: "MODULE_REJECTED" });
		expect(frame.received).toEqual([]);
		expect(s.state.kind).toBe("ready");
	});

	it("closes on disorder, a foreign session, a wrong nonce or another host profile", async () => {
		const cases: [string, (f: FakeFrame) => void][] = [
			[
				"disorder",
				(f) =>
					f.send(
						{
							type: "ready",
							nonce: f.bootstrap?.nonce,
							hostProfileId: "host-abi-dev-v1",
						},
						{ seq: 2 },
					),
			],
			[
				"foreign",
				(f) =>
					f.send(
						{
							type: "ready",
							nonce: f.bootstrap?.nonce,
							hostProfileId: "host-abi-dev-v1",
						},
						{ session: "sess_ffffffffffffffff" },
					),
			],
			[
				"nonce",
				(f) =>
					f.send({
						type: "ready",
						nonce: "f".repeat(32),
						hostProfileId: "host-abi-dev-v1",
					}),
			],
			["profile", (f) => f.ready("studio-host-v1")],
		];
		for (const [name, act] of cases) {
			const frame = new FakeFrame();
			const states: SessionState[] = [];
			const s = open(frame, states);
			act(frame);
			expect(await s.whenReady(), name).toBe(false);
			expect(s.state.kind, name).toBe("closed");
		}
	});

	it("closes when the frame does not answer a render in time, and on dispose", async () => {
		const frame = new FakeFrame();
		const s = open(frame, [], 50);
		frame.ready();
		await s.whenReady();
		const text = "export default {}";
		const outcome = await s.render({
			previewRevision: "1",
			puckType: "Preview",
			module: { digest: await sha256Text(text), text },
			styles: [],
			props: {},
		});
		expect(outcome).toEqual({ kind: "error", code: "PROTOCOL_VIOLATION" });
		expect(s.state).toMatchObject({
			kind: "closed",
			reason: "no render answer within the deadline",
		});

		const other = new FakeFrame();
		const t = open(other);
		other.ready();
		await t.whenReady();
		t.dispose();
		await until(() => other.received.length === 1);
		expect(other.received[0]).toMatchObject({ type: "dispose", seq: 1 });
		expect(t.state.kind).toBe("closed");
	});
});
