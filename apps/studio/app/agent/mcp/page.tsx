import type { Metadata } from "next";
import { platformFromEnv } from "@/lib/agent/platform";
import { getServerT } from "@/lib/i18n/server";
import { McpView } from "./view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getServerT();
	return { title: t("meta.mcp.title"), description: t("meta.mcp.description") };
}

/**
 * `/agent/mcp` — reviewed MCP management (P20 over API-10/15/16): the
 * catalog of discovered and reviewed descriptors (visibility is not a
 * grant), review decisions bound to the exact descriptor digest, grants
 * bound to a descriptor revision and method scope, and revocation progress
 * with blocked admission shown apart from converged senders.
 */
export default function McpPage() {
	return <McpView configured={platformFromEnv() !== null} />;
}
