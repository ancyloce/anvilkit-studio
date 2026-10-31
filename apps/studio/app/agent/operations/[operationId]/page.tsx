import type { Metadata } from "next";
import { Suspense } from "react";
import { getServerT } from "@/lib/i18n/server";
import { OperationView } from "./view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getServerT();
	return {
		title: t("meta.operation.title"),
		description: t("meta.operation.description"),
	};
}

/**
 * `/agent/operations/:operationId` — the committed progress of one operation
 * (P20): snapshot plus durable SSE events, tracked cancel/hold/resume, the
 * factual progress timeline with the linked preparation (plan 0005 Phase 3),
 * and a link to the source workbench for an operation whose source can be
 * edited.
 */
export default async function OperationPage({
	params,
}: {
	params: Promise<{ operationId: string }>;
}) {
	const { operationId } = await params;
	// The view reads `?from=` (the linked preparation, plan 0005 §4.5).
	return (
		<Suspense fallback={null}>
			<OperationView operationId={operationId} />
		</Suspense>
	);
}
