import { createReadStream, statSync } from "node:fs";
import { join, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";

/**
 * Same-origin delivery of the component artifacts under proof (AnvilKit DD-05
 * §6.4 names a same-origin authenticated asset route as the initial delivery
 * option; this proof route serves a directory configured at *runtime*, so the
 * Studio build is unchanged when a different component artifact is placed
 * there). It performs no authentication: it exists only for the S1-T03 host
 * loading proof and is inert unless `ANVILKIT_HOST_ABI_PROOF_ASSETS` is set.
 */
const TYPES: Record<string, string> = {
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".map": "application/json; charset=utf-8",
};

export const dynamic = "force-dynamic";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
	const root = process.env.ANVILKIT_HOST_ABI_PROOF_ASSETS;
	if (!root) return new Response("proof assets are not configured", { status: 404 });
	const { path } = await context.params;
	const base = resolve(root);
	const target = resolve(base, normalize(join(...path)));
	if (target !== base && !target.startsWith(base + sep)) {
		return new Response("outside the asset directory", { status: 404 });
	}
	let size: number;
	try {
		const stat = statSync(target);
		if (!stat.isFile()) return new Response("not a file", { status: 404 });
		size = stat.size;
	} catch {
		return new Response("not found", { status: 404 });
	}
	const extension = target.slice(target.lastIndexOf("."));
	const type = TYPES[extension] ?? "application/octet-stream";
	const body = Readable.toWeb(createReadStream(target)) as ReadableStream;
	return new Response(body, {
		status: 200,
		headers: {
			"content-type": type,
			"content-length": String(size),
			"cache-control": "no-store",
		},
	});
}
