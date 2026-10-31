import type { Metadata } from "next";
import { platformFromEnv } from "@/lib/agent/platform";
import { getServerT } from "@/lib/i18n/server";
import { KnowledgeView } from "./view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getServerT();
	return {
		title: t("meta.knowledge.title"),
		description: t("meta.knowledge.description"),
	};
}

/**
 * `/agent/knowledge` — reviewed knowledge management (P20 over API-07/08/09/
 * 13/14): sources with their ACL revision and ingest state, ACL replacement
 * and deletion under expected revisions, cited search, and memory facts with
 * authorized decisions. Knowledge owns every decision; the view shows its
 * answers.
 */
export default function KnowledgePage() {
	return <KnowledgeView configured={platformFromEnv() !== null} />;
}
