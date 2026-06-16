import type { PageRootProps } from "@anvilkit/schema";
import { validatePagePayload } from "@anvilkit/validator";
import type { Data } from "@puckeditor/core";
import type { DemoComponents } from "./puck-demo";

export type PersistKind = "draft" | "publish";
export interface PersistResult {
	readonly ok: boolean;
	/** The first validation issue's message when `ok === false`. */
	readonly issue?: string;
}

const remoteStorageEnabled = (): boolean =>
	process.env.NEXT_PUBLIC_USE_REMOTE_STORAGE === "true";

/**
 * F7 save/publish gateway: validate the page payload, then persist. Returns
 * `{ ok:false, issue }` for an invalid payload — the caller surfaces the issue
 * and aborts (nothing is written). On success, persists to `localStorage`
 * (`anvilkit_page_<slug>`, MVP) or POSTs to `/api/pages/<kind>` when
 * `NEXT_PUBLIC_USE_REMOTE_STORAGE === "true"`.
 */
export async function persistPage(
	kind: PersistKind,
	data: Data<DemoComponents, PageRootProps>,
): Promise<PersistResult> {
	const rootProps = data.root.props as PageRootProps | undefined;
	const result = validatePagePayload(rootProps);
	if (!result.valid) {
		return {
			ok: false,
			issue: result.issues[0]?.message ?? "Invalid page payload",
		};
	}

	const slug = rootProps?.slug ?? "";
	if (remoteStorageEnabled()) {
		await fetch(`/api/pages/${kind}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ slug, data }),
		});
	} else if (typeof localStorage !== "undefined" && slug.length > 0) {
		localStorage.setItem(`anvilkit_page_${slug}`, JSON.stringify(data));
	}
	return { ok: true };
}
