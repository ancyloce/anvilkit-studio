import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DEVELOPMENT_ONLY release source of the StudioBridge loader (P20):
 * `GET /api/host/releases/catalog` answers `<dir>/catalog.json`, and
 * `GET /api/host/releases/<releaseId>/<path>` answers one file of one exact
 * release from `<dir>/<releaseId>/<path>`, where `<dir>` is
 * `ANVILKIT_DEV_RELEASES_DIR`. A release added to the directory is loadable
 * without rebuilding the host. The route decides nothing about approval: the
 * lock names the exact release and the loader verifies every byte against
 * the lock's manifest digest. ENV-07/08 replace it with the authorized
 * catalog and artifact origin.
 */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TYPES: Record<string, string> = {
	".json": "application/json",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
};

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
	const dir = process.env.ANVILKIT_DEV_RELEASES_DIR?.trim();
	if (!dir)
		return new Response("release source not configured", { status: 404 });
	const { path: segments } = await params;
	if (
		segments.length === 0 ||
		segments.length > 8 ||
		!segments.every((s) => SEGMENT.test(s) && s !== "." && s !== "..")
	) {
		return new Response("not found", { status: 404 });
	}
	const relative =
		segments.length === 1 && segments[0] === "catalog"
			? "catalog.json"
			: segments.length >= 2
				? segments.join("/")
				: null;
	const type = relative ? TYPES[path.extname(relative)] : undefined;
	if (!relative || !type) return new Response("not found", { status: 404 });
	try {
		const root = await realpath(dir);
		const file = await realpath(path.join(root, relative));
		if (!file.startsWith(root + path.sep)) {
			return new Response("not found", { status: 404 });
		}
		const bytes = await readFile(file);
		return new Response(new Uint8Array(bytes), {
			headers: {
				"Content-Type": type,
				"Cache-Control": "no-store",
				"X-Content-Type-Options": "nosniff",
			},
		});
	} catch {
		return new Response("not found", { status: 404 });
	}
}
