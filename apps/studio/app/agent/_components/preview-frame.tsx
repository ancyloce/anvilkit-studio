"use client";

/**
 * The separate-origin preview frame (P20, anvilkit-preview-v1). The iframe
 * is sandboxed with `allow-scripts` only, never `allow-same-origin`, and
 * loads the preview origin's frame page; every document it loads gets its
 * own `PreviewSession`, and a second load of the same element (a navigation)
 * closes the session instead of rebinding it. Replacing the frame (a new
 * `frameKey`) or unmounting disposes the session. Nothing of the preview
 * module is imported into the Studio realm.
 */

import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import {
	PreviewSession,
	type RenderOutcome,
	type RenderRequest,
	type SessionState,
} from "@/lib/agent/preview-bridge";

export interface PreviewFrameHandle {
	render(request: RenderRequest): Promise<RenderOutcome>;
}

export function PreviewFrame({
	previewOrigin,
	hostProfileId,
	title,
	onSession,
	onState,
}: {
	readonly previewOrigin: string;
	readonly hostProfileId: string;
	readonly title: string;
	readonly onSession: (handle: PreviewFrameHandle | null) => void;
	readonly onState: (state: SessionState) => void;
}): ReactElement {
	const frame = useRef<HTMLIFrameElement>(null);
	const session = useRef<PreviewSession | null>(null);
	const loads = useRef(0);
	// The source is set only after mount: a frame that finished loading before
	// hydration attached onLoad would never get its session.
	const [src, setSrc] = useState<string | undefined>(undefined);
	useEffect(() => {
		setSrc(`${previewOrigin}/frame.html`);
	}, [previewOrigin]);

	useEffect(
		() => () => {
			session.current?.dispose();
			session.current = null;
			onSession(null);
		},
		[onSession],
	);

	const onLoad = () => {
		// The initial about:blank document of a frame without a source is not
		// the preview frame.
		if (src === undefined) return;
		loads.current += 1;
		if (loads.current > 1 || !frame.current?.contentWindow) {
			// A navigation of the frame ends the session; a new one needs a new frame.
			session.current?.close("frame navigated");
			onSession(null);
			return;
		}
		const s = new PreviewSession({
			frame: frame.current.contentWindow,
			parentOrigin: window.location.origin,
			hostProfileId,
			onState: (state) => {
				onState(state);
				if (state.kind === "closed") onSession(null);
			},
		});
		session.current = s;
		onState(s.state);
		void s.whenReady().then((ok) => {
			if (ok && session.current === s)
				onSession({ render: (r) => s.render(r) });
		});
	};

	return (
		<iframe
			ref={frame}
			title={title}
			src={src}
			sandbox="allow-scripts"
			referrerPolicy="no-referrer"
			className="h-96 w-full rounded-md border bg-white"
			data-testid="preview-frame"
			onLoad={onLoad}
		/>
	);
}
