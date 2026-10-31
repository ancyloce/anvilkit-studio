import {
	errorEnvelope,
	notConfigured,
	PlatformError,
	platformFetch,
	platformFromEnv,
	relay,
	unreachable,
	uploadArtifact,
} from "@/lib/agent/platform";
import {
	isSourcePath,
	MAX_ARCHIVE_BYTES,
	MAX_FILES,
	TarError,
	writeTar,
} from "@/lib/agent/tar";
import type { PreviewRequest } from "@/lib/agent/workbench-files";

export const runtime = "nodejs";

/** The reviewed Control profile of a conditional save plus isolated preview build. */
const PREVIEW_PROFILE = "preview-build-v1";
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,100}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const SEQ = /^(0|[1-9][0-9]{0,19})$/;

function valid(body: unknown): body is PreviewRequest {
	if (typeof body !== "object" || body === null) return false;
	const b = body as Record<string, unknown>;
	return (
		typeof b.commandId === "string" &&
		ID.test(b.commandId) &&
		typeof b.lineage === "string" &&
		DIGEST.test(b.lineage) &&
		typeof b.baseRevision === "string" &&
		SEQ.test(b.baseRevision) &&
		Array.isArray(b.files) &&
		b.files.length > 0 &&
		b.files.length <= MAX_FILES &&
		b.files.every(
			(f) =>
				typeof f === "object" &&
				f !== null &&
				typeof f.path === "string" &&
				isSourcePath(f.path) &&
				(typeof f.text === "string" || typeof f.base64 === "string"),
		)
	);
}

/**
 * `POST /api/agent/workbench/:operationId/previews` — saves and previews one
 * edit: the edited files become one deterministic source archive, uploaded
 * as a `source` artifact, and one `preview_build` operation binds it with the
 * lineage it edits and the revision the edit was based on. The operation's
 * workflow saves conditionally through the source authority (a newer
 * revision answers `conflict`, never an overwrite) and then builds the saved
 * revision in isolation. The browser keeps its edits either way.
 */
export async function POST(
	req: Request,
	{ params }: { params: Promise<{ operationId: string }> },
): Promise<Response> {
	const { operationId } = await params;
	const body: unknown = await req.json().catch(() => null);
	if (!ID.test(operationId) || !valid(body)) {
		return errorEnvelope(
			400,
			"INVALID_ARGUMENT",
			"The body must carry a commandId, the lineage, the base revision and the files.",
			false,
		);
	}
	const config = platformFromEnv();
	if (!config) return notConfigured();
	let archive: Uint8Array;
	try {
		archive = writeTar(
			body.files.map((f) => ({
				path: f.path,
				bytes:
					"text" in f
						? new TextEncoder().encode(f.text)
						: new Uint8Array(Buffer.from(f.base64, "base64")),
			})),
		);
	} catch (err) {
		return errorEnvelope(
			400,
			"INVALID_ARGUMENT",
			err instanceof TarError
				? err.message
				: "The files do not form a source archive.",
			false,
		);
	}
	if (archive.byteLength > MAX_ARCHIVE_BYTES) {
		return errorEnvelope(
			400,
			"INVALID_ARGUMENT",
			"The source archive is too large.",
			false,
		);
	}
	try {
		const source = await uploadArtifact(config, {
			commandId: body.commandId,
			class: "source",
			mediaType: "application/x-tar",
			bytes: archive,
			signal: req.signal,
		});
		return relay(
			await platformFetch(config, "POST", "operations", {
				json: {
					commandId: body.commandId,
					kind: "preview_build",
					subject: {
						profileId: PREVIEW_PROFILE,
						subjectDigest: body.lineage,
						sourceRevision: body.baseRevision,
						sourceHandle: source.handle,
					},
				},
				signal: req.signal,
			}),
		);
	} catch (err) {
		if (err instanceof PlatformError) return relay(err.response);
		return unreachable();
	}
}
