import {
	agentGatewayFromEnv,
	submitPreparation,
} from "@/lib/agent/preparation-gateway";

export const runtime = "nodejs";

/**
 * `POST /api/agent/preparations` — forwards a `PreparationCommand` to the
 * Agent API's `POST /v1/operations/preparations` with the server-held
 * credential and returns Control's acceptance or error envelope as is.
 */
export async function POST(req: Request): Promise<Response> {
	const command: unknown = await req.json().catch(() => null);
	if (typeof command !== "object" || command === null) {
		return Response.json(
			{
				code: "INVALID_ARGUMENT",
				message: "The body must be a PreparationCommand object.",
				retryable: false,
			},
			{ status: 400 },
		);
	}
	const { status, body } = await submitPreparation(
		agentGatewayFromEnv(),
		command,
		req.signal,
	);
	return Response.json(body, { status });
}
