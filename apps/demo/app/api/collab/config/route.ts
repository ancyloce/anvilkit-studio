/**
 * Runtime collaboration config for the editor's `?relay=hocuspocus` path.
 *
 * The browser opens the WebSocket, so the relay URL must be host-reachable and
 * is environment-specific. `NEXT_PUBLIC_*` is inlined at build time and cannot
 * carry a per-deploy URL into a prebuilt image, so the editor reads it from
 * this server route instead (the server reads `COLLAB_HOCUSPOCUS_URL` at
 * request time — set it per `docker run`/compose; defaults to the dev relay the
 * `dev` supervisor auto-starts on :31234).
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
	const wsUrl = process.env.COLLAB_HOCUSPOCUS_URL ?? "ws://localhost:31234";
	return Response.json({ wsUrl });
}
