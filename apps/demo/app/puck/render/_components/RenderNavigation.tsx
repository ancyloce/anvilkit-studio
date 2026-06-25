"use client";

/**
 * @file Client-side navigation interceptor for rendered pages.
 *
 * The render path uses `<Render>` from `@puckeditor/core/rsc`, which emits
 * plain `<a href>` anchors (e.g. an `@anvilkit/button` configured with a path).
 * A bare anchor click triggers a full-document reload. This wrapper performs
 * event delegation over its subtree: a left-click on an internal anchor is
 * rewritten to the page's `/puck/render/<slug>` route and pushed through the
 * App Router, giving a soft (no full reload) client-side navigation. External
 * links, new-tab/modified clicks, and downloads keep their native behavior.
 *
 * It is intentionally a thin boundary around the server-rendered tree: server
 * components are passed through as `children`, so the render output still ships
 * zero editor JavaScript — only this delegation handler is hydrated.
 */
import { useRouter } from "next/navigation";
import { type ReactElement, type ReactNode, useEffect, useRef } from "react";
import { isInternalPath, toRenderHref } from "../../../../lib/page-link";

export function RenderNavigation({
	children,
}: {
	readonly children: ReactNode;
}): ReactElement {
	const router = useRouter();
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const node = containerRef.current;
		if (node === null) return;

		const onClick = (event: MouseEvent): void => {
			// Respect default-prevented, non-primary, and modified clicks so
			// "open in new tab" and the like still work.
			if (event.defaultPrevented || event.button !== 0) return;
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
				return;
			}

			const anchor = (event.target as HTMLElement | null)?.closest("a");
			if (anchor === null || anchor === undefined) return;

			const target = anchor.getAttribute("target");
			if (target !== null && target !== "" && target !== "_self") return;
			if (anchor.hasAttribute("download")) return;

			const href = anchor.getAttribute("href");
			if (href === null || !isInternalPath(href)) return;

			event.preventDefault();
			router.push(toRenderHref(href));
		};

		node.addEventListener("click", onClick);
		return () => node.removeEventListener("click", onClick);
	}, [router]);

	// `display: contents` keeps the wrapper out of the layout box model so the
	// rendered page lays out exactly as it would unwrapped.
	return (
		<div ref={containerRef} style={{ display: "contents" }}>
			{children}
		</div>
	);
}
