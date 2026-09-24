import {
	agentGatewayFromEnv,
	isOperationId,
	submitPreparationAnswers,
} from "@/lib/agent/preparation-gateway";

export const runtime = "nodejs";

/**
 * `POST /api/agent/preparations/:operationId/answers` — forwards a
 * `PreparationAnswersCommand` to `POST /v1/operations/:id/preparation-answers`.
 * Control accepts the set once for the current question-set revision; a
 * superseded revision, a duplicate command or a second set comes back as the
 * 409 envelope Control returned.
 */
export async function POST(
	req: Request,
	{ params }: { params: Promise<{ operationId: string }> },
): Promise<Response> {
	const { operationId } = await params;
	const command: unknown = await req.json().catch(() => null);
	if (
		!isOperationId(operationId) ||
		typeof command !== "object" ||
		command === null
	) {
		return Response.json(
			{
				code: "INVALID_ARGUMENT",
				message:
					"The body must be a PreparationAnswersCommand object for a valid operation.",
				retryable: false,
			},
			{ status: 400 },
		);
	}
	const { status, body } = await submitPreparationAnswers(
		agentGatewayFromEnv(),
		operationId,
		command,
		req.signal,
	);
	return Response.json(body, { status });
}
