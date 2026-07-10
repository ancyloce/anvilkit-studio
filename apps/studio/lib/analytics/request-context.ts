/**
 * @file Server-only: derive privacy-safe enrichment from an incoming request.
 *
 * The raw client IP is NEVER stored or returned — it is immediately reduced to
 * a salted SHA-256 hash that serves only as a coarse uniqueness signal. The
 * salt is `ANVILKIT_ANALYTICS_IP_SALT` when set, otherwise a per-process random
 * salt (so hashes can't be correlated across restarts/deploys — maximally
 * conservative). The user-agent is stored as the raw header string (a coarse
 * client hint, not PII).
 */

import crypto from "node:crypto";
import type { ServerEnrichment } from "./types";

/** Per-process fallback salt — regenerated each boot when no env salt is set. */
const PROCESS_SALT = crypto.randomBytes(16).toString("hex");

function ipSalt(): string {
	return process.env.ANVILKIT_ANALYTICS_IP_SALT ?? PROCESS_SALT;
}

/** First hop of `x-forwarded-for`, falling back to `x-real-ip`. */
function clientIp(headers: Headers): string | undefined {
	const forwarded = headers.get("x-forwarded-for");
	if (forwarded) {
		const first = forwarded.split(",")[0]?.trim();
		if (first) return first;
	}
	const real = headers.get("x-real-ip");
	return real ?? undefined;
}

/** Salted SHA-256 of an IP, truncated — exported for direct unit testing. */
export function hashIp(ip: string, salt: string = ipSalt()): string {
	return crypto
		.createHash("sha256")
		.update(`${salt}:${ip}`)
		.digest("hex")
		.slice(0, 32);
}

/**
 * Build the {@link ServerEnrichment} for a request: a coarse user-agent and a
 * salted IP hash. Either field is omitted when the source header is absent.
 */
export function deriveServerEnrichment(req: Request): ServerEnrichment {
	const enrichment: ServerEnrichment = {};
	const userAgent = req.headers.get("user-agent");
	if (userAgent) enrichment.user_agent = userAgent;
	const ip = clientIp(req.headers);
	if (ip) enrichment.ip_hash = hashIp(ip);
	return enrichment;
}
