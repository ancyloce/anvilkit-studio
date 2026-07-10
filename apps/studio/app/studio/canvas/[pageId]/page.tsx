import { CanvasStudioClient } from "./CanvasStudioClient";

export default async function CanvasStudioPage({
	params,
}: {
	params: Promise<{ pageId: string }>;
}) {
	const { pageId } = await params;
	return <CanvasStudioClient pageId={pageId} />;
}
