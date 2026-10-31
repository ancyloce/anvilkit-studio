import { parseAccess } from "@/lib/agent/management";
import {
	errorEnvelope,
	notConfigured,
	platformFromEnv,
	relay,
	unreachable,
	uploadSource,
} from "@/lib/agent/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The document bound of the view's uploads (Knowledge's own sources.max_bytes refuses more). */
const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;
const COMMAND = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,100}$/;
const MEDIA_TYPE = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/;

/**
 * `POST /api/agent/knowledge/uploads` (P2.6) — one document from the browser
 * (multipart: `file`, `commandId`, optional `mediaType` and `access`)
 * uploaded through Knowledge's single-use capability and registered as a
 * source, all server-side with the server-held credential. Answers the
 * registration (202 with the source) or the platform's error envelope.
 */
export async function POST(req: Request): Promise<Response> {
	const config = platformFromEnv();
	if (!config) return notConfigured();
	let form: FormData;
	try {
		form = await req.formData();
	} catch {
		return errorEnvelope(
			400,
			"INVALID_ARGUMENT",
			"Expected a multipart form.",
			false,
		);
	}
	const file = form.get("file");
	const commandId = String(form.get("commandId") ?? "");
	if (!(file instanceof File) || !COMMAND.test(commandId)) {
		return errorEnvelope(
			400,
			"INVALID_ARGUMENT",
			"A file and a command id are required.",
			false,
		);
	}
	if (file.size === 0 || file.size > MAX_DOCUMENT_BYTES) {
		return errorEnvelope(
			400,
			"INVALID_ARGUMENT",
			"The document is empty or too large.",
			false,
		);
	}
	const mediaType = String(
		form.get("mediaType") || file.type || "",
	).toLowerCase();
	if (!MEDIA_TYPE.test(mediaType)) {
		return errorEnvelope(
			400,
			"INVALID_ARGUMENT",
			"The document's media type is unknown.",
			false,
		);
	}
	const access = parseAccess(String(form.get("access") ?? ""));
	if (!access) {
		return errorEnvelope(
			400,
			"INVALID_ARGUMENT",
			"The access entries are malformed.",
			false,
		);
	}
	try {
		return relay(
			await uploadSource(config, {
				commandId,
				mediaType,
				bytes: new Uint8Array(await file.arrayBuffer()),
				access,
				signal: req.signal,
			}),
		);
	} catch {
		return unreachable();
	}
}
