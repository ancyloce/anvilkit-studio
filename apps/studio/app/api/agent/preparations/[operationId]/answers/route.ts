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
	ANSWER_MAX_BYTES,
	type AnswerRequest,
	byteLength,
} from "@/lib/agent/preparation-client";

export const runtime = "nodejs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,100}$/;
const SEQ = /^(0|[1-9][0-9]{0,19})$/;

function valid(body: unknown): body is AnswerRequest {
	if (typeof body !== "object" || body === null) return false;
	const b = body as Record<string, unknown>;
	return (
		typeof b.commandId === "string" &&
		ID.test(b.commandId) &&
		typeof b.questionSetId === "string" &&
		ID.test(b.questionSetId) &&
		typeof b.questionSetRevision === "string" &&
		SEQ.test(b.questionSetRevision) &&
		typeof b.answer === "string" &&
		b.answer.trim() !== "" &&
		byteLength(b.answer) <= ANSWER_MAX_BYTES
	);
}

/**
 * `POST /api/agent/preparations/:operationId/answers` — uploads the answer
 * text as an `answer` artifact and submits `POST
 * /api/v1/preparations/{id}/answers` bound to the question set id and revision
 * the view was read at. A superseded question set comes back as the
 * Agent API's REVISION_CONFLICT envelope.
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
			"The body must carry a commandId, the question set id and revision, and an answer.",
			false,
		);
	}
	const config = platformFromEnv();
	if (!config) return notConfigured();
	try {
		const answer = await uploadArtifact(config, {
			commandId: body.commandId,
			class: "answer",
			mediaType: "text/plain; charset=utf-8",
			bytes: new TextEncoder().encode(body.answer),
			signal: req.signal,
		});
		return relay(
			await platformFetch(
				config,
				"POST",
				`preparations/${operationId}/answers`,
				{
					json: {
						commandId: body.commandId,
						questionSetId: body.questionSetId,
						questionSetRevision: body.questionSetRevision,
						answer: { transferId: answer.transferId, digest: answer.digest },
					},
					signal: req.signal,
				},
			),
		);
	} catch (err) {
		if (err instanceof PlatformError) return relay(err.response);
		return unreachable();
	}
}
