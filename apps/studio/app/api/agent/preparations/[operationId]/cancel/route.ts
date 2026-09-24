import {
	agentGatewayFromEnv,
	cancelPreparation,
	isOperationId,
} from "@/lib/agent/preparation-gateway";

export const runtime = "nodejs";

/**
 * `POST /api/agent/preparations/:operationId/cancel` — forwards a
 * `ControlCommand` to the reserved control lane (`POST /v1/operations/:id/cancel`).
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
					"The body must be a ControlCommand object for a valid operation.",
				retryable: false,
			},
			{ status: 400 },
		);
	}
	const { status, body } = await cancelPreparation(
		agentGatewayFromEnv(),
		operationId,
		command,
		req.signal,
	);
	return Response.json(body, { status });
}
