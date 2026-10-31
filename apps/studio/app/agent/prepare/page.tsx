import type { Metadata } from "next";
import { Suspense } from "react";
import { platformFromEnv } from "@/lib/agent/platform";
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
 * `/agent/prepare` — the Studio entry point of the preparation flow on the
 * V4 Agent API (P20): submit a prompt, follow the durable operation by its
 * identifier (kept in the URL so a refresh reopens the same task) through
 * the committed snapshot and event stream, and answer the posed
 * clarification. The browser talks to this server's `/api/agent/*` routes
 * only.
 */
export default function PreparePage() {
	// Whether the server holds an Agent API credential is decided here, on the
	// server, so the page can say so without the client probing.
	const configured = platformFromEnv() !== null;
	return (
		<Suspense fallback={null}>
			<PreparationWorkbench configured={configured} />
		</Suspense>
	);
}
