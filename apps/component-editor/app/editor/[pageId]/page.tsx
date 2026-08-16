import { emptyDocument } from "@/lib/empty-document";
import { getPageStorage } from "@/lib/page-store";
import { EditorMount } from "./EditorMount";

export const runtime = "nodejs";

/**
 * Editor route. Loads the page's draft (falling back to an empty document
 * for a brand-new id) and hands it to the client mount as the initial
 * seed — see `EditorMount` for why `data` is seed-only.
 */
export default async function EditorPage({
	params,
	searchParams,
}: {
	params: Promise<{ pageId: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const { pageId } = await params;
	const query = await searchParams;
	const storage = await getPageStorage();
	const record = await storage.getById(pageId);
	const initialData = record?.draft ?? record?.published ?? emptyDocument();

	return (
		<EditorMount
			pageId={pageId}
			initialData={initialData}
			codePanelOpen={query.code === "1"}
		/>
	);
}
