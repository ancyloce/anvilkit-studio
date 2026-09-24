import type { Metadata } from "next";
import { Suspense } from "react";
import { agentGatewayFromEnv } from "@/lib/agent/preparation-gateway";
import { getServerT } from "@/lib/i18n/server";
import { PreparationWorkbench } from "./workbench";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getServerT();
	return {
		title: t("meta.prepare.title"),
		description: t("meta.prepare.description"),
	};
}

/**
 * `/agent/prepare` — the Studio entry point of the preparation flow (AnvilKit
 * development plan S2-T01/T03/T06, 2026-09-13): submit a Prompt with
 * controlled brand and asset references, follow the durable task by its
 * operation identifier (kept in the URL so a refresh reopens the same task),
 * answer the posed clarification and read the frozen brief. The browser talks
 * to this server's `/api/agent/preparations/*` routes only.
 */
export default function PreparePage() {
	// Whether the server holds an Agent API credential is decided here, on the
	// server, so the page can say so without the client probing.
	const configured = agentGatewayFromEnv() !== null;
	return (
		<Suspense fallback={null}>
			<PreparationWorkbench configured={configured} />
		</Suspense>
	);
}
