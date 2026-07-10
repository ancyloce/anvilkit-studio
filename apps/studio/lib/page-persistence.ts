import type { PageRootProps } from "@anvilkit/schema";
import { validatePagePayload } from "@anvilkit/validator";
import type { Data } from "@puckeditor/core";
import type { ApiResponse } from "./page-storage/response";
import type { DemoComponents } from "./puck-demo";

export type PersistKind = "draft" | "publish";
export interface PersistResult {
	readonly ok: boolean;
	/** The first validation issue / server message when `ok === false`. */
	readonly issue?: string;
}

/**
 * F7 save/publish gateway: validate the page payload, then persist it through
 * the durable Page API (`POST /api/pages/<kind>` → {@link getPageStorage},
 * SQLite by default). Returns `{ ok:false, issue }` for an invalid payload or a
 * rejected/failed write — the caller surfaces the issue and aborts (nothing is
 * served). The legacy `localStorage` MVP and the `NEXT_PUBLIC_USE_REMOTE_STORAGE`
 * gate are gone: every save/publish is durable.
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
	try {
		const res = await fetch(`/api/pages/${kind}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ slug, data }),
		});
		if (!res.ok) {
			const body = (await res
				.json()
				.catch(() => null)) as ApiResponse<unknown> | null;
			const issue =
				body !== null && body.ok === false
					? body.message
					: `Persist failed (${res.status})`;
			return { ok: false, issue };
		}
	} catch (error) {
		return {
			ok: false,
			issue: error instanceof Error ? error.message : "Persist request failed",
		};
	}
	return { ok: true };
}
