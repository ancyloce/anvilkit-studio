/**
 * Runtime collaboration config for the collab demos (`/collab` and the
 * editor's `?relay=hocuspocus` path).
 *
 * The browser opens the WebSocket, so the relay URL must be host-reachable and
 * is environment-specific. `NEXT_PUBLIC_*` is inlined at build time and cannot
 * carry a per-deploy URL into a prebuilt image, so the client reads it from
 * this server route instead (the server reads `COLLAB_HOCUSPOCUS_URL` at
 * request time — set it per `docker run`/compose).
 *
 * When `COLLAB_HOCUSPOCUS_URL` is unset we return `wsUrl: null` rather than a
 * baked `ws://localhost:31234`, so the client can derive a host-relative URL
 * from `window.location` (see `resolveCollabRelayUrl`). That is what lets the
 * same prebuilt image work on localhost AND on a real server with no rebuild.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
	const wsUrl = process.env.COLLAB_HOCUSPOCUS_URL?.trim() || null;
	return Response.json({ wsUrl });
}
