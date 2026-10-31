import type { Metadata } from "next";
import { platformFromEnv } from "@/lib/agent/platform";
import { getServerT } from "@/lib/i18n/server";
import { SourceWorkbench } from "./workbench";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getServerT();
	return {
		title: t("meta.workbench.title"),
		description: t("meta.workbench.description"),
	};
}

/** The Host ABI profile the Studio host provides to preview frames (DEVELOPMENT_ONLY default). */
const DEFAULT_HOST_PROFILE = "host-abi-dev-v1";

/**
 * `/agent/workbench/:operationId` — edit the source an operation names, save
 * it conditionally and preview the saved revision in the separate-origin
 * sandboxed frame (P20). The preview origin is server configuration
 * (`ANVILKIT_PREVIEW_ORIGIN`, DEVELOPMENT_ONLY until ENV-08 names the real
 * origin); without it the workbench edits and saves but renders nothing.
 */
export default async function WorkbenchPage({
	params,
}: {
	params: Promise<{ operationId: string }>;
}) {
	const { operationId } = await params;
	const origin = process.env.ANVILKIT_PREVIEW_ORIGIN?.trim() ?? "";
	return (
		<SourceWorkbench
			operationId={operationId}
			configured={platformFromEnv() !== null}
			previewOrigin={/^https?:\/\/[^/]+$/.test(origin) ? origin : null}
			hostProfileId={
				process.env.ANVILKIT_PREVIEW_HOST_PROFILE?.trim() ||
				DEFAULT_HOST_PROFILE
			}
		/>
	);
}
