#!/usr/bin/env node
// Minimal in-memory Hocuspocus relay for the `/collab` demo page
// (docs Path C). The demo's `createCollabHocuspocusTransport` speaks the
// Hocuspocus wire protocol, which the repo's y-websocket reference relay
// (`pnpm relay`, port 21234) does NOT — pointing a HocuspocusProvider at
// that server leaves the client perpetually reconnecting. This gives the
// demo a protocol-compatible server to talk to.
//
// Run:  pnpm --filter studio relay:hocuspocus            (port 31234)
//       node scripts/hocuspocus-dev-relay.mjs 41234     (custom port)
//
// Alpha-grade: in-memory only (no persistence), no auth (accepts any
// token). Production deployments own auth/persistence — see
// packages/extensions/plugins/plugin-collab-yjs/docs/hocuspocus-deployment.md.
import { Server } from "@hocuspocus/server";

// 31234 (not 1234/11234/21234): 1234/11234 hit WSL2 + Hyper-V dynamic
// port reservations, and 21234 is the y-websocket reference relay. Keep
// in sync with NEXT_PUBLIC_COLLAB_HOCUSPOCUS_URL's default in
// apps/studio/app/collab/page.tsx.
const port = Number.parseInt(
	process.argv[2] ?? process.env.COLLAB_HOCUSPOCUS_PORT ?? "31234",
	10,
);

const server = new Server({ port, name: "anvilkit-dev-hocuspocus" });

server
	.listen()
	.then(() => {
		console.log(`hocuspocus dev relay listening on ws://localhost:${port}`);
	})
	.catch((error) => {
		const code = error?.code;
		if (code === "EADDRINUSE") {
			console.error(
				`Port ${port} is already in use. Stop the process holding it ` +
					`(lsof -nP -iTCP:${port} -sTCP:LISTEN) or pass another port: ` +
					`node scripts/hocuspocus-dev-relay.mjs <port>`,
			);
		} else {
			console.error("hocuspocus dev relay failed to start:", error);
		}
		process.exit(1);
	});
