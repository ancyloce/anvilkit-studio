/**
 * @file Server-side gateway from the Studio's `/api/agent/preparations/*`
 * route handlers to the Agent API (development plan S2, 2026-09-13).
 *
 * The browser never holds a platform credential: the Studio server forwards
 * each command with `ANVILKIT_AGENT_API_TOKEN` (the controlled identity
 * profile's bearer credential for one actor and tenant) and passes the Agent
 * API's JSON body and status back unchanged, including its error envelope, so
 * the client sees exactly what Control decided. This is the "existing Studio
 * server proxy" the architecture allows for browser authentication; it adds
 * no business decision.
 */

export interface AgentGatewayConfig {
	readonly baseUrl: string;
	readonly token: string;
}

/** Read the configuration; `null` when the entry point is not enabled. */
export function agentGatewayFromEnv(
	env: Readonly<Record<string, string | undefined>> = process.env,
): AgentGatewayConfig | null {
	const baseUrl = env.ANVILKIT_AGENT_API_URL?.trim();
	const token = env.ANVILKIT_AGENT_API_TOKEN?.trim();
	if (!baseUrl || !token) return null;
	return { baseUrl: baseUrl.replace(/\/+$/, ""), token };
}

export interface GatewayResponse {
	readonly status: number;
	readonly body: unknown;
}

const NOT_CONFIGURED: GatewayResponse = {
	status: 503,
	body: {
		code: "DEPENDENCY_UNAVAILABLE",
		message:
			"The Agent API is not configured for this Studio server (ANVILKIT_AGENT_API_URL and ANVILKIT_AGENT_API_TOKEN).",
		retryable: false,
	},
};

const UNREACHABLE: GatewayResponse = {
	status: 503,
	body: {
		code: "DEPENDENCY_UNAVAILABLE",
		message: "The Agent API did not answer.",
		retryable: true,
		retryAfterMs: 2000,
	},
};

/** Operation identifiers are `urn:anvilkit:values:v1#/$defs/id`. */
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function isOperationId(value: string): boolean {
	return IDENTIFIER.test(value);
}

async function forward(
	config: AgentGatewayConfig | null,
	method: "GET" | "POST",
	path: string,
	body?: unknown,
	signal?: AbortSignal,
): Promise<GatewayResponse> {
	if (!config) return NOT_CONFIGURED;
	let response: Response;
	try {
		response = await fetch(config.baseUrl + path, {
			method,
			headers: {
				Authorization: `Bearer ${config.token}`,
				...(body === undefined ? {} : { "Content-Type": "application/json" }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: signal ?? AbortSignal.timeout(15_000),
			cache: "no-store",
		});
	} catch {
		return UNREACHABLE;
	}
	const text = await response.text();
	let parsed: unknown = null;
	if (text !== "") {
		try {
			parsed = JSON.parse(text);
		} catch {
			return UNREACHABLE;
		}
	}
	return { status: response.status, body: parsed };
}

/** `POST /v1/operations/preparations` */
export function submitPreparation(
	config: AgentGatewayConfig | null,
	command: unknown,
	signal?: AbortSignal,
): Promise<GatewayResponse> {
	return forward(
		config,
		"POST",
		"/v1/operations/preparations",
		command,
		signal,
	);
}

/** `GET /v1/operations/{operationId}/preparation` */
export function readPreparation(
	config: AgentGatewayConfig | null,
	operationId: string,
	signal?: AbortSignal,
): Promise<GatewayResponse> {
	return forward(
		config,
		"GET",
		`/v1/operations/${encodeURIComponent(operationId)}/preparation`,
		undefined,
		signal,
	);
}

/** `POST /v1/operations/{operationId}/preparation-answers` */
export function submitPreparationAnswers(
	config: AgentGatewayConfig | null,
	operationId: string,
	command: unknown,
	signal?: AbortSignal,
): Promise<GatewayResponse> {
	return forward(
		config,
		"POST",
		`/v1/operations/${encodeURIComponent(operationId)}/preparation-answers`,
		command,
		signal,
	);
}

/** `POST /v1/operations/{operationId}/cancel` (the reserved control lane). */
export function cancelPreparation(
	config: AgentGatewayConfig | null,
	operationId: string,
	command: unknown,
	signal?: AbortSignal,
): Promise<GatewayResponse> {
	return forward(
		config,
		"POST",
		`/v1/operations/${encodeURIComponent(operationId)}/cancel`,
		command,
		signal,
	);
}
