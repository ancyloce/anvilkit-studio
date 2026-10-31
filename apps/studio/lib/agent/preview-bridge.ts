/**
 * @file Parent side of anvilkit-preview-v1 (P20, DD-04 §5, DD-05 §4;
 * contracts `components/component.schema.json` previewBootstrap and
 * previewMessage).
 *
 * Unapproved preview code never runs in the Studio realm: it runs only in a
 * frame served by the separate preview origin, embedded sandboxed with
 * `allow-scripts` and never `allow-same-origin`, so the frame's origin is
 * opaque. One `PreviewSession` owns one frame document: it sends the single
 * bootstrap to that frame's window (target origin `*` because an opaque origin
 * cannot be named; the frame itself accepts it only from `window.parent` at
 * the configured parent origin), keeps the bound `MessagePort`, and checks
 * every message the frame answers with: typed, bounded, the session's own
 * identity, and `seq` starting at 1 and increasing by exactly one. Disorder,
 * an unknown type, oversize, a wrong session, a timeout, a navigation of the
 * frame or its replacement closes the session for good; a new session needs a
 * new frame. The module and stylesheets it forwards are the exact bytes the
 * Agent API served for the digests the committed preview names, and the frame
 * verifies them again before importing anything.
 */

export const PREVIEW_PROTOCOL = "anvilkit-preview-v1";
/** Bounds of the development preview profile. */
export const MAX_MODULE_CHARS = 2 * 1024 * 1024;
export const MAX_STYLE_CHARS = 1024 * 1024;
export const MAX_STYLES = 16;
export const MAX_INBOUND_CHARS = 64 * 1024;
export const READY_TIMEOUT_MS = 10_000;
export const RENDER_TIMEOUT_MS = 15_000;

const SESSION = /^[A-Za-z0-9_-]{16,64}$/;
const NONCE = /^[0-9a-f]{32,64}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const PUCK_TYPE = /^[A-Z][A-Za-z0-9]{0,63}$/;
const SEQUENCE = /^(0|[1-9][0-9]{0,19})$/;

export type PreviewErrorCode =
	| "MODULE_REJECTED"
	| "STYLE_REJECTED"
	| "RENDER_FAILED"
	| "PROTOCOL_VIOLATION";

export interface VerifiedText {
	readonly digest: string;
	readonly text: string;
}

export interface RenderRequest {
	readonly previewRevision: string;
	readonly puckType: string;
	readonly module: VerifiedText;
	readonly styles: readonly VerifiedText[];
	readonly props: Record<string, unknown>;
}

export type RenderOutcome =
	| { readonly kind: "rendered"; readonly previewRevision: string }
	| { readonly kind: "error"; readonly code: PreviewErrorCode };

export type SessionState =
	| { readonly kind: "connecting" }
	| { readonly kind: "ready"; readonly hostProfileId: string }
	| { readonly kind: "closed"; readonly reason: string };

function randomHex(bytes: number): string {
	const b = new Uint8Array(bytes);
	crypto.getRandomValues(b);
	return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function sha256Text(text: string): Promise<string> {
	const sum = new Uint8Array(
		await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
	);
	return `sha256:${Array.from(sum, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function sizeOf(value: unknown): number {
	try {
		return JSON.stringify(value).length;
	} catch {
		return Number.POSITIVE_INFINITY;
	}
}

interface Pending {
	readonly renderSeq: number;
	readonly resolve: (outcome: RenderOutcome) => void;
	readonly timer: ReturnType<typeof setTimeout>;
}

export interface PreviewSessionOptions {
	/** The frame window this session is bound to (the iframe's contentWindow at load). */
	readonly frame: Window;
	/** The Studio's own origin, which the frame page names as its parent. */
	readonly parentOrigin: string;
	/** The host profile the preview was built for; a frame on another profile is refused. */
	readonly hostProfileId: string;
	readonly onState?: (state: SessionState) => void;
	readonly readyTimeoutMs?: number;
	readonly renderTimeoutMs?: number;
}

/** One session over one frame document. */
export class PreviewSession {
	readonly session = `sess_${randomHex(12)}`;
	private readonly nonce = randomHex(16);
	private readonly port: MessagePort;
	private inSeq = 0;
	private outSeq = 0;
	private pending: Pending | undefined;
	private readyTimer: ReturnType<typeof setTimeout> | undefined;
	private current: SessionState = { kind: "connecting" };
	private readonly ready: Promise<boolean>;
	private resolveReady!: (ok: boolean) => void;

	constructor(private readonly options: PreviewSessionOptions) {
		this.ready = new Promise((resolve) => {
			this.resolveReady = resolve;
		});
		const channel = new MessageChannel();
		this.port = channel.port1;
		this.port.onmessage = (ev) => this.onMessage(ev.data);
		this.port.onmessageerror = () => this.close("undecodable message");
		this.readyTimer = setTimeout(
			() => this.close("no ready within the deadline"),
			options.readyTimeoutMs ?? READY_TIMEOUT_MS,
		);
		options.frame.postMessage(
			{
				type: "anvilkit.preview.bootstrap",
				protocol: PREVIEW_PROTOCOL,
				session: this.session,
				nonce: this.nonce,
				parentOrigin: options.parentOrigin,
			},
			"*",
			[channel.port2],
		);
	}

	get state(): SessionState {
		return this.current;
	}

	/** Resolves true once the frame answered `ready` for this session. */
	whenReady(): Promise<boolean> {
		return this.ready;
	}

	private setState(state: SessionState): void {
		this.current = state;
		this.options.onState?.(state);
	}

	/** Ends the session: sends `dispose` when it is still open, then closes the port. */
	dispose(): void {
		if (this.current.kind === "ready") this.post({ type: "dispose" });
		this.close("disposed");
	}

	/** Closes the session for good (a frame load, replacement or unmount calls this). */
	close(reason: string): void {
		if (this.current.kind === "closed") return;
		if (this.readyTimer) clearTimeout(this.readyTimer);
		if (this.pending) {
			clearTimeout(this.pending.timer);
			this.pending.resolve({ kind: "error", code: "PROTOCOL_VIOLATION" });
			this.pending = undefined;
		}
		this.port.onmessage = null;
		this.port.close();
		this.resolveReady(false);
		this.setState({ kind: "closed", reason });
	}

	private post(message: Record<string, unknown>): number {
		this.outSeq += 1;
		this.port.postMessage({
			...message,
			session: this.session,
			seq: this.outSeq,
		});
		return this.outSeq;
	}

	/**
	 * Renders one preview. Only one render is in flight; the texts must hash
	 * to their digests here already, so bytes that changed on the way are never
	 * sent.
	 */
	async render(request: RenderRequest): Promise<RenderOutcome> {
		if (!(await this.ready) || this.current.kind !== "ready")
			return { kind: "error", code: "PROTOCOL_VIOLATION" };
		if (this.pending) return { kind: "error", code: "PROTOCOL_VIOLATION" };
		if (
			!SEQUENCE.test(request.previewRevision) ||
			!PUCK_TYPE.test(request.puckType) ||
			!DIGEST.test(request.module.digest) ||
			request.module.text.length > MAX_MODULE_CHARS ||
			request.styles.length > MAX_STYLES ||
			request.styles.some(
				(s) => !DIGEST.test(s.digest) || s.text.length > MAX_STYLE_CHARS,
			)
		) {
			return { kind: "error", code: "PROTOCOL_VIOLATION" };
		}
		if ((await sha256Text(request.module.text)) !== request.module.digest)
			return { kind: "error", code: "MODULE_REJECTED" };
		for (const s of request.styles) {
			if ((await sha256Text(s.text)) !== s.digest)
				return { kind: "error", code: "STYLE_REJECTED" };
		}
		if (this.current.kind !== "ready")
			return { kind: "error", code: "PROTOCOL_VIOLATION" };
		return new Promise<RenderOutcome>((resolve) => {
			const renderSeq = this.post({
				type: "render",
				previewRevision: request.previewRevision,
				puckType: request.puckType,
				module: { digest: request.module.digest, text: request.module.text },
				styles: request.styles.map((s) => ({ digest: s.digest, text: s.text })),
				props: request.props,
			});
			const timer = setTimeout(
				() => this.close("no render answer within the deadline"),
				this.options.renderTimeoutMs ?? RENDER_TIMEOUT_MS,
			);
			this.pending = { renderSeq, resolve, timer };
		});
	}

	private onMessage(data: unknown): void {
		if (this.current.kind === "closed") return;
		const msg = data as Record<string, unknown> | null;
		if (
			!msg ||
			typeof msg !== "object" ||
			sizeOf(msg) > MAX_INBOUND_CHARS ||
			msg.session !== this.session ||
			msg.seq !== this.inSeq + 1
		) {
			this.close("disorder, oversize or foreign session");
			return;
		}
		this.inSeq += 1;
		switch (msg.type) {
			case "ready": {
				if (
					this.inSeq !== 1 ||
					msg.nonce !== this.nonce ||
					!NONCE.test(String(msg.nonce)) ||
					!SESSION.test(String(msg.session))
				) {
					this.close("ready does not answer this bootstrap");
					return;
				}
				if (msg.hostProfileId !== this.options.hostProfileId) {
					this.close(
						`host profile ${String(msg.hostProfileId)} is not ${this.options.hostProfileId}`,
					);
					return;
				}
				if (this.readyTimer) clearTimeout(this.readyTimer);
				this.setState({
					kind: "ready",
					hostProfileId: String(msg.hostProfileId),
				});
				this.resolveReady(true);
				return;
			}
			case "rendered":
			case "error": {
				if (this.inSeq === 1) {
					this.close("answer before ready");
					return;
				}
				const pending = this.pending;
				if (msg.type === "error" && msg.renderSeq === undefined) {
					this.close(`frame closed the session: ${String(msg.code)}`);
					return;
				}
				if (!pending || msg.renderSeq !== pending.renderSeq) {
					this.close("answer to no render in flight");
					return;
				}
				clearTimeout(pending.timer);
				this.pending = undefined;
				if (msg.type === "rendered") {
					pending.resolve({
						kind: "rendered",
						previewRevision: String(msg.previewRevision),
					});
				} else {
					const code = String(msg.code);
					const known: PreviewErrorCode[] = [
						"MODULE_REJECTED",
						"STYLE_REJECTED",
						"RENDER_FAILED",
						"PROTOCOL_VIOLATION",
					];
					pending.resolve({
						kind: "error",
						code: known.includes(code as PreviewErrorCode)
							? (code as PreviewErrorCode)
							: "PROTOCOL_VIOLATION",
					});
				}
				return;
			}
			default:
				this.close(`unknown message type ${String(msg.type)}`);
		}
	}
}
