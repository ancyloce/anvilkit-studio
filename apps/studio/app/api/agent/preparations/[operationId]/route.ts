import {
	agentGatewayFromEnv,
	isOperationId,
	readPreparation,
} from "@/lib/agent/preparation-gateway";

export const runtime = "nodejs";

/**
 * `GET /api/agent/preparations/:operationId` — the Agent API's
 * `PreparationDetail` (committed stage, projection and the input, question
 * set, accepted answers and brief content) for the server's actor scope.
 */
export async function GET(
	req: Request,
	{ params }: { params: Promise<{ operationId: string }> },
): Promise<Response> {
	const { operationId } = await params;
	if (!isOperationId(operationId)) {
		return Response.json(
			{
				code: "INVALID_ARGUMENT",
				message: "The operation identifier is not a values-v1 identifier.",
				retryable: false,
			},
			{ status: 400 },
		);
	}
	const { status, body } = await readPreparation(
		agentGatewayFromEnv(),
		operationId,
		req.signal,
	);
	return Response.json(body, {
		status,
		headers: { "Cache-Control": "no-store" },
	});
}
