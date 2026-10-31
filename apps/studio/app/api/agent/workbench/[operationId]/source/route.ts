import {
	errorEnvelope,
	notConfigured,
	platformFetch,
	platformFromEnv,
	relay,
	sha256Digest,
	unreachable,
} from "@/lib/agent/platform";
import { MAX_ARCHIVE_BYTES, readTar, TarError } from "@/lib/agent/tar";
import type {
	WorkbenchFile,
	WorkbenchSource,
} from "@/lib/agent/workbench-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const SEQ = /^(0|[1-9][0-9]{0,19})$/;

/**
 * `GET /api/agent/workbench/:operationId/source` — reads the exact source
 * archive the operation names (`GET /api/v1/operations/{id}/source`: a
 * generation's certified source or a preview build's saved edit), checks its
 * bytes against the digest header, and answers the files as JSON with the
 * lineage and the revision the edit will be based on. The archive is read,
 * never extracted to disk.
 */
export async function GET(
	req: Request,
	{ params }: { params: Promise<{ operationId: string }> },
): Promise<Response> {
	const { operationId } = await params;
	if (!ID.test(operationId))
		return errorEnvelope(
			400,
			"INVALID_ARGUMENT",
			"Not an operation identifier.",
			false,
		);
	const config = platformFromEnv();
	if (!config) return notConfigured();
	let response: Response;
	try {
		response = await platformFetch(
			config,
			"GET",
			`operations/${operationId}/source`,
			{ signal: req.signal },
		);
	} catch {
		return unreachable();
	}
	if (response.status !== 200) return relay(response);
	const lineage = response.headers.get("anvilkit-source-lineage") ?? "";
	const digest = response.headers.get("anvilkit-source-digest") ?? "";
	const revision =
		response.headers.get("anvilkit-source-revision") ?? undefined;
	const bytes = new Uint8Array(await response.arrayBuffer());
	if (
		!DIGEST.test(lineage) ||
		!DIGEST.test(digest) ||
		(revision !== undefined && !SEQ.test(revision)) ||
		bytes.byteLength > MAX_ARCHIVE_BYTES ||
		sha256Digest(bytes) !== digest
	) {
		return errorEnvelope(
			503,
			"DEPENDENCY_UNAVAILABLE",
			"The source archive does not match its digest.",
			true,
		);
	}
	let files: WorkbenchFile[];
	try {
		const decoder = new TextDecoder("utf-8", { fatal: true });
		files = readTar(bytes).map((f) => {
			try {
				return { path: f.path, text: decoder.decode(f.bytes) };
			} catch {
				return {
					path: f.path,
					base64: Buffer.from(f.bytes).toString("base64"),
				};
			}
		});
	} catch (err) {
		const reason = err instanceof TarError ? err.message : "unreadable archive";
		return errorEnvelope(
			503,
			"DEPENDENCY_UNAVAILABLE",
			`The source archive is not editable here: ${reason}.`,
			false,
		);
	}
	const body: WorkbenchSource = {
		operationId,
		lineage,
		digest,
		...(revision ? { revision } : {}),
		files,
	};
	return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
