export const runtime = "nodejs";

const UNSPLASH_API = "https://api.unsplash.com";

// Rate-limit + retry headers the asset-manager Unsplash client reads off the
// response to drive its `rateLimited` state (PRD 0002 §8.5).
const FORWARDED_HEADERS = [
	"x-ratelimit-limit",
	"x-ratelimit-remaining",
	"x-ratelimit-reset",
	"retry-after",
] as const;

// Bound each upstream attempt so a stalled connection fails fast instead of
// hanging on undici's 10s default connect timeout, then retry once. The demo's
// network path to Unsplash is frequently a corporate proxy / VPN tunnel that
// resolves `api.unsplash.com` to a synthetic address (e.g. the 198.18.0.0/15
// benchmarking range) and intermittently black-holes the TLS connect — a
// single retry recovers the transient blips, and a bounded timeout keeps a
// genuine outage from blocking the request for 10–14s and surfacing as an
// unhandled 500. Override the per-attempt cap with `UNSPLASH_PROXY_TIMEOUT_MS`.
const DEFAULT_TIMEOUT_MS = 6000;
const MAX_ATTEMPTS = 2;

function resolveTimeoutMs(): number {
	const raw = Number(process.env.UNSPLASH_PROXY_TIMEOUT_MS);
	return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

/**
 * True for the network/timeout failures worth retrying: our own per-attempt
 * timeout (`TimeoutError`) and undici's connect/socket errors. A deliberate
 * client cancel (`req.signal`) is handled separately so it never retries.
 */
function isRetryableNetworkError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const name = (error as { name?: unknown }).name;
	if (name === "TimeoutError") return true;
	const code =
		(error as { cause?: { code?: unknown } }).cause?.code ??
		(error as { code?: unknown }).code;
	return (
		code === "UND_ERR_CONNECT_TIMEOUT" ||
		code === "UND_ERR_HEADERS_TIMEOUT" ||
		code === "UND_ERR_SOCKET" ||
		code === "ECONNRESET" ||
		code === "ECONNREFUSED" ||
		code === "ETIMEDOUT" ||
		code === "EAI_AGAIN"
	);
}

/** First configured outbound-proxy env var, if any (respects lowercase too). */
function proxyEnv(): string | undefined {
	return (
		process.env.HTTPS_PROXY ||
		process.env.https_proxy ||
		process.env.HTTP_PROXY ||
		process.env.http_proxy ||
		process.env.ALL_PROXY ||
		process.env.all_proxy ||
		undefined
	);
}

// Node's global `fetch` IGNORES `HTTP(S)_PROXY`. In environments that only reach
// the internet through a local/corporate proxy (WSL2, regional proxies, CI
// behind a gateway — the same one `curl` honors), a direct socket to
// `api.unsplash.com` stalls on the TLS handshake while the proxy path succeeds.
// When a proxy env var is set we route the upstream call through undici's
// `EnvHttpProxyAgent` (which reads `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`),
// using undici's OWN `fetch` so the dispatcher is version-matched — the global
// fetch rejects a dispatcher from a separately-installed undici. Built once,
// lazily, and only when a proxy is configured, so a proxy-less deployment keeps
// using the global fetch byte-for-byte. Falls back to global fetch if undici
// can't be loaded for any reason.
let upstreamFetchPromise: Promise<typeof fetch> | undefined;

function getUpstreamFetch(): Promise<typeof fetch> {
	if (proxyEnv() === undefined) return Promise.resolve(fetch);
	upstreamFetchPromise ??= (async () => {
		try {
			const { fetch: undiciFetch, EnvHttpProxyAgent } = await import("undici");
			const dispatcher = new EnvHttpProxyAgent();
			return ((
				input: Parameters<typeof fetch>[0],
				init?: Parameters<typeof fetch>[1],
			) =>
				undiciFetch(input as Parameters<typeof undiciFetch>[0], {
					...(init as Parameters<typeof undiciFetch>[1]),
					dispatcher,
				})) as unknown as typeof fetch;
		} catch {
			return fetch;
		}
	})();
	return upstreamFetchPromise;
}

/**
 * Server-side Unsplash proxy (PRD 0002 §8.3). The asset-manager Unsplash client
 * points its `proxyEndpoint` here and requests
 * `/api/unsplash/<unsplash-path>?<params>` (e.g. `/api/unsplash/search/photos`,
 * `/api/unsplash/topics/<slug>/photos`). This handler injects the `Client-ID`
 * from the server-only `UNSPLASH_ACCESS_KEY` so the key never ships to the
 * browser, and forwards the rate-limit headers back.
 *
 * Without `UNSPLASH_ACCESS_KEY` set, the demo simply does not enable Unsplash
 * (see `NEXT_PUBLIC_UNSPLASH_ENABLED` in `lazy-plugins.ts`), so this route only
 * runs when the operator has provided a key. The 503 below is a defensive
 * fallback if it is hit while unconfigured.
 *
 * Upstream fetch failures (timeout / DNS / blocked tunnel) return a clean 504
 * in the same `{ errors: [...] }` shape Unsplash uses, which the asset-manager
 * client maps to a retryable `PROVIDER_BAD_RESPONSE` — rather than throwing an
 * unhandled 500 that the client can only read as an opaque HTML error page.
 */
export async function GET(
	req: Request,
	{ params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
	const accessKey = process.env.UNSPLASH_ACCESS_KEY;
	if (!accessKey) {
		return Response.json(
			{
				errors: [
					"Unsplash is not configured on this server (set UNSPLASH_ACCESS_KEY).",
				],
			},
			{ status: 503 },
		);
	}

	const { path } = await params;
	const search = new URL(req.url).search;
	const target = `${UNSPLASH_API}/${path.map(encodeURIComponent).join("/")}${search}`;
	const timeoutMs = resolveTimeoutMs();
	// Honors HTTP(S)_PROXY when set; otherwise the plain global fetch.
	const upstreamFetch = await getUpstreamFetch();

	let lastError: unknown;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		// Bail before spending another attempt if the browser already gave up.
		if (req.signal?.aborted) {
			return Response.json({ errors: ["Request cancelled."] }, { status: 499 });
		}

		// Abort the attempt when EITHER our per-attempt timeout fires OR the
		// incoming request is cancelled. `AbortSignal.any` may be unavailable on
		// very old runtimes, so fall back to the timeout alone.
		const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
		if (req.signal instanceof AbortSignal) signals.push(req.signal);
		const signal = signals.length === 1 ? signals[0] : AbortSignal.any(signals);

		try {
			const upstream = await upstreamFetch(target, {
				headers: {
					Authorization: `Client-ID ${accessKey}`,
					"Accept-Version": "v1",
				},
				signal,
			});

			const headers = new Headers({
				"content-type":
					upstream.headers.get("content-type") ?? "application/json",
			});
			for (const name of FORWARDED_HEADERS) {
				const value = upstream.headers.get(name);
				if (value !== null) {
					headers.set(name, value);
				}
			}

			// Forward the upstream status as-is (incl. 401/403/429) so the client
			// keeps its rate-limit + auth handling. Only thrown network failures
			// below trigger a retry.
			return new Response(await upstream.text(), {
				status: upstream.status,
				headers,
			});
		} catch (error) {
			lastError = error;
			// A deliberate client cancel: don't retry, don't log as a server error.
			if (req.signal?.aborted) {
				return Response.json(
					{ errors: ["Request cancelled."] },
					{ status: 499 },
				);
			}
			if (attempt < MAX_ATTEMPTS && isRetryableNetworkError(error)) {
				continue;
			}
			break;
		}
	}

	const detail =
		lastError instanceof Error
			? `${lastError.name}: ${lastError.message}`
			: String(lastError);
	console.error(
		`[unsplash-proxy] upstream fetch failed for ${target}: ${detail}`,
	);
	return Response.json(
		{
			errors: [
				"Unsplash upstream is unreachable from this server (network timeout). " +
					"The route already routes through HTTP(S)_PROXY when set; if it is " +
					"still failing, check that the proxy is running and can reach " +
					"api.unsplash.com (or unset the proxy if direct access is available).",
			],
		},
		{ status: 504 },
	);
}
